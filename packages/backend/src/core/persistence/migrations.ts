/**
 * Migration runner.
 *
 * Phase 1: only the empty `_migrations` table is created. Phase 2 will add
 * `001_init.sql` which defines `devices`, `rooms`, `room_devices`, `scenes`,
 * and `adapter_state`.
 */
import type { Persistence } from "./sqlite.js";

export interface Migration {
  id: string;
  /** SQL statements to apply, separated by `;`. */
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: "001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ord INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        adapter_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        state TEXT NOT NULL,
        reachable INTEGER NOT NULL DEFAULT 1,
        room_id TEXT,
        last_updated INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS room_devices (
        room_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        PRIMARY KEY (room_id, device_id)
      );

      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        device_states TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS adapter_state (
        adapter_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        message TEXT,
        details TEXT
      );
    `,
  },
];

export async function runMigrations(p: Persistence): Promise<void> {
  for (const m of MIGRATIONS) {
    const existing = await p.get<{ id: string }>("SELECT id FROM _migrations WHERE id = ?", [m.id]);
    if (existing) continue;
    // Split on `;` and run each non-empty statement.
    const statements = m.sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+_migrations/i.test(s));
    for (const s of statements) {
      await p.run(s);
    }
    await p.run("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)", [m.id, Date.now()]);
  }
}