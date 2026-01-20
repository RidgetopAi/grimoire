/**
 * Database connection and initialization for Grimoire
 *
 * Uses better-sqlite3 for synchronous SQLite access with FTS5 support.
 */

import Database from 'better-sqlite3';
import { SCHEMA_SQL, SCHEMA_VERSION, isSchemaCurrentQuery, markSchemaVersionQuery } from './schema.js';

export type { Database as DatabaseType } from 'better-sqlite3';

let db: Database.Database | null = null;

/**
 * Initialize or get the database connection
 *
 * @param dbPath - Path to the SQLite database file
 * @returns The database connection
 */
export function getDatabase(dbPath: string): Database.Database {
  if (db) {
    return db;
  }

  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Initialize schema if needed
  initializeSchema(db);

  return db;
}

/**
 * Initialize the database schema
 */
function initializeSchema(database: Database.Database): void {
  // Check if schema is already applied
  try {
    const result = database.prepare(isSchemaCurrentQuery()).get() as { version: number } | undefined;
    if (result?.version === SCHEMA_VERSION) {
      return; // Schema is current
    }
  } catch {
    // Table doesn't exist yet, continue with initialization
  }

  // Apply schema
  database.exec(SCHEMA_SQL);

  // Mark version as applied
  database.prepare(markSchemaVersionQuery()).run();
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Check if database exists and is valid
 *
 * @param dbPath - Path to check
 * @returns True if database exists and has valid schema
 */
export function isDatabaseValid(dbPath: string): boolean {
  try {
    const testDb = new Database(dbPath, { readonly: true });
    const result = testDb.prepare(isSchemaCurrentQuery()).get() as { version: number } | undefined;
    testDb.close();
    return result?.version === SCHEMA_VERSION;
  } catch {
    return false;
  }
}

/**
 * Get the count of commands in the database
 */
export function getCommandCount(database: Database.Database): number {
  const result = database.prepare('SELECT COUNT(*) as count FROM commands').get() as { count: number };
  return result.count;
}
