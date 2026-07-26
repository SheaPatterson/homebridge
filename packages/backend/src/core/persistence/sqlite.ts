/**
 * Persistence layer.
 *
 * Uses `better-sqlite3` when the native binding is available; falls back to a
 * pure-JS `Map`-backed store otherwise. Both implementations share the same
 * `Persistence` interface so repositories can be coded against the contract.
 *
 * Phase 1 of the v2 plan. A tiny migration runner is provided so Phase 2 can
 * bring in `001_init.sql` without changing the persistence interface.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface Persistence {
  /** Apply all pending migrations. Idempotent. */
  migrate(): Promise<void>;
  /** Prepare & execute a parameterised statement. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Return rows matching a SELECT. */
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Return a single row, or `undefined` if none. */
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Close the underlying connection. */
  close(): Promise<void>;
  /** True if this is the real SQLite backend. */
  readonly isSqlite: boolean;
}

// ---------------------------------------------------------------------------
// better-sqlite3 implementation
// ---------------------------------------------------------------------------

interface SqliteStatement {
  run(...params: unknown[]): void;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface SqliteDb {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(pragma: string): unknown;
  close(): void;
}

class SqlitePersistence implements Persistence {
  readonly isSqlite = true;
  private readonly db: SqliteDb;
  private readonly cache = new Map<string, SqliteStatement>();

  constructor(db: SqliteDb) {
    this.db = db;
    // Foreign keys are off by default; we want them on.
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async migrate(): Promise<void> {
    // Phase 1: no migrations yet. Phase 2 will add 001_init.sql.
    this.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
  }

  private exec(sql: string): void {
    this.db.exec(sql);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.stmt(sql).run(...params);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.stmt(sql).all(...params) as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.stmt(sql).get(...params) as T | undefined;
  }

  async close(): Promise<void> {
    this.cache.clear();
    this.db.close();
  }

  private stmt(sql: string): SqliteStatement {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

/**
 * Tiny relational-ish in-memory store. Implements the subset of SQL we use:
 *   - SELECT ... FROM ... [WHERE col = ?]
 *   - INSERT INTO ... (cols) VALUES (?, ?, ...)
 *   - UPDATE ... SET col = ? [, ...] WHERE col = ?
 *   - DELETE FROM ... WHERE col = ?
 *   - CREATE TABLE IF NOT EXISTS (col TYPE PRIMARY KEY, ...)
 *
 * This is enough to keep the rest of the codebase uniform even when running
 * in environments where the native sqlite binding is unavailable.
 */
class MemoryPersistence implements Persistence {
  readonly isSqlite = false;
  private readonly tables = new Map<string, { pk: string; rows: Map<string, Record<string, unknown>> }>();

  async migrate(): Promise<void> {
    // No-op for Phase 1; Phase 2 will register migrations here too.
    this.ensure("_migrations", "id");
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    const trimmed = sql.trim();
    if (/^CREATE\s+TABLE/i.test(trimmed)) {
      const { name, pk } = parseCreateTable(trimmed);
      this.ensure(name, pk);
      return;
    }
    if (/^INSERT\s+INTO/i.test(trimmed)) {
      const { name, cols, values } = parseInsert(trimmed);
      const table = this.ensure(name, cols[0]);
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => (row[c] = values[i]));
      // params take precedence over parsed values if provided
      for (let i = 0; i < params.length; i++) row[cols[i]] = params[i];
      table.rows.set(String(row[table.pk]), row);
      return;
    }
    if (/^UPDATE/i.test(trimmed)) {
      const { name, setCols, whereCol } = parseUpdate(trimmed);
      const table = this.ensure(name, whereCol);
      const target = table.rows.get(String(params[params.length - 1]));
      if (!target) return;
      setCols.forEach((c, i) => (target[c] = params[i]));
      return;
    }
    if (/^DELETE\s+FROM/i.test(trimmed)) {
      const { name, whereCol } = parseDelete(trimmed);
      const table = this.ensure(name, whereCol);
      table.rows.delete(String(params[0]));
      return;
    }
    throw new Error(`MemoryPersistence: unsupported statement: ${trimmed}`);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const trimmed = sql.trim();
    if (!/^SELECT/i.test(trimmed)) {
      throw new Error(`MemoryPersistence.all: expected SELECT, got: ${trimmed}`);
    }
    const { name, whereCol } = parseSelect(trimmed);
    const table = this.tables.get(name);
    if (!table) return [];
    const rows = Array.from(table.rows.values());
    if (!whereCol) return rows as T[];
    return rows.filter((r) => r[whereCol] === params[0]) as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async close(): Promise<void> {
    this.tables.clear();
  }

  private ensure(name: string, pk: string) {
    let table = this.tables.get(name);
    if (!table) {
      table = { pk, rows: new Map() };
      this.tables.set(name, table);
    }
    return table;
  }
}

// ---------------------------------------------------------------------------
// Tiny SQL parsers for the MemoryPersistence
// ---------------------------------------------------------------------------

function parseCreateTable(sql: string): { name: string; pk: string } {
  const m = sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(([^)]+)\)/i);
  if (!m) throw new Error(`Cannot parse CREATE TABLE: ${sql}`);
  const name = m[1];
  const cols = m[2].split(",").map((c) => c.trim());
  const pk = cols[0].split(/\s+/)[0];
  return { name, pk };
}

function parseInsert(sql: string): { name: string; cols: string[]; values: unknown[] } {
  const m = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (!m) throw new Error(`Cannot parse INSERT: ${sql}`);
  return {
    name: m[1],
    cols: m[2].split(",").map((c) => c.trim()),
    values: m[3].split(",").map((c) => parseValue(c.trim())),
  };
}

function parseUpdate(sql: string): { name: string; setCols: string[]; whereCol: string } {
  const m = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(\w+)\s*=\s*\?/i);
  if (!m) throw new Error(`Cannot parse UPDATE: ${sql}`);
  return {
    name: m[1],
    setCols: m[2].split(",").map((c) => c.trim().split("=")[0].trim()),
    whereCol: m[3],
  };
}

function parseDelete(sql: string): { name: string; whereCol: string } {
  const m = sql.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i);
  if (!m) throw new Error(`Cannot parse DELETE: ${sql}`);
  return { name: m[1], whereCol: m[2] };
}

function parseSelect(sql: string): { name: string; whereCol: string | null } {
  const m = sql.match(/FROM\s+(\w+)/i);
  if (!m) throw new Error(`Cannot parse SELECT: ${sql}`);
  const where = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
  return { name: m[1], whereCol: where ? where[1] : null };
}

function parseValue(v: string): unknown {
  if (v === "NULL") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  if (!Number.isNaN(n) && v !== "") return n;
  return v.replace(/^'(.*)'$/, "$1");
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cached: Persistence | null = null;

/**
 * Create or reuse a persistence instance.
 *
 * The default `path` lives at `.data/hub.sqlite` relative to the project root
 * so it survives `pnpm dev` restarts. Tests can pass a per-test file or the
 * special string `:memory:` (default) to avoid hitting the filesystem.
 */
export async function createPersistence(opts: { path?: string } = {}): Promise<Persistence> {
  if (cached) return cached;
  const path = opts.path ?? ":memory:";

  // Try better-sqlite3 first; fall back to in-memory on any failure.
  try {
    const mod = await import("better-sqlite3");
    const Database = (mod as { default?: unknown }).default ?? mod;
    if (path !== ":memory:") {
      const abs = resolve(path);
      if (!existsSync(dirname(abs))) mkdirSync(dirname(abs), { recursive: true });
    }
    const db = (Database as (path: string) => SqliteDb)(path);
    const p = new SqlitePersistence(db);
    await p.migrate();
    cached = p;
    return p;
  } catch (err) {
    // Native binding unavailable — fall back so dev never crashes on a fresh
    // checkout.
    // eslint-disable-next-line no-console
    console.warn(
      `[persistence] better-sqlite3 unavailable (${(err as Error).message}); using in-memory store.`,
    );
    const p = new MemoryPersistence();
    await p.migrate();
    cached = p;
    return p;
  }
}

/** Reset the cached singleton (test helper). */
export function resetPersistenceCache(): void {
  cached = null;
}
