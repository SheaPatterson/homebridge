// src/core/persistence/sqlite.ts

import { open } from 'better-sqlite3';
import * as path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'data', 'smart_home.db');

/**
 * Initializes and returns a persistent SQLite database connection.
 * @returns {any} The better-sqlite3 Database object.
 */
export function initializeDatabase() {
    console.log(`[DB] Initializing database at: ${DB_PATH}`);
    // In a real app, we'd use a dedicated migration runner here.
    return open(DB_PATH); 
}

/**
 * Simple wrapper for running migrations (Placeholder).
 */
export function runMigrations(db: any) {
    console.log("[DB] Running initial schema setup...");
    // Placeholder logic to ensure tables exist before use.
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                is_online BOOLEAN DEFAULT 0,
                last_seen INTEGER
            );
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );
        `);
    } catch (e) {
        console.error("Migration failed:", e);
    }
}