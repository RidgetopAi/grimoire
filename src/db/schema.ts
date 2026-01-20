/**
 * Database schema for Grimoire
 *
 * Uses SQLite with FTS5 for full-text search capability.
 * This is the source of truth for the database structure.
 */

export const SCHEMA_VERSION = 1;

/**
 * Main schema SQL - creates all tables, triggers, and indexes
 */
export const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER DEFAULT (unixepoch())
);

-- Core table: unique commands with metadata
CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY,
  command TEXT NOT NULL UNIQUE,
  annotation TEXT,
  tags TEXT,                      -- JSON array: ["git", "deploy"]
  first_seen INTEGER NOT NULL,    -- Unix timestamp
  last_seen INTEGER NOT NULL,     -- Unix timestamp
  run_count INTEGER DEFAULT 1,
  favorite INTEGER DEFAULT 0,
  private INTEGER DEFAULT 0,      -- Exclude from AI export
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS commands_fts USING fts5(
  command,
  annotation,
  tags,
  content=commands,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Triggers to sync FTS with commands table
CREATE TRIGGER IF NOT EXISTS commands_ai AFTER INSERT ON commands BEGIN
  INSERT INTO commands_fts(rowid, command, annotation, tags)
  VALUES (new.id, new.command, new.annotation, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS commands_ad AFTER DELETE ON commands BEGIN
  INSERT INTO commands_fts(commands_fts, rowid, command, annotation, tags)
  VALUES('delete', old.id, old.command, old.annotation, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS commands_au AFTER UPDATE ON commands BEGIN
  INSERT INTO commands_fts(commands_fts, rowid, command, annotation, tags)
  VALUES('delete', old.id, old.command, old.annotation, old.tags);
  INSERT INTO commands_fts(rowid, command, annotation, tags)
  VALUES (new.id, new.command, new.annotation, new.tags);
END;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_commands_last_seen ON commands(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_commands_favorite ON commands(favorite) WHERE favorite = 1;
CREATE INDEX IF NOT EXISTS idx_commands_private ON commands(private) WHERE private = 1;
`;

/**
 * Check if schema version is current
 */
export function isSchemaCurrentQuery(): string {
  return `SELECT version FROM schema_version WHERE version = ${SCHEMA_VERSION}`;
}

/**
 * Mark schema version as applied
 */
export function markSchemaVersionQuery(): string {
  return `INSERT OR REPLACE INTO schema_version (version) VALUES (${SCHEMA_VERSION})`;
}
