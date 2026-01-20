/**
 * Command Store Service
 *
 * CRUD operations for commands in the database.
 * Handles deduplication, timestamp management, and FTS sync.
 */

import type Database from 'better-sqlite3';

export interface Command {
  id: number;
  command: string;
  annotation: string | null;
  tags: string[] | null;
  firstSeen: number;
  lastSeen: number;
  runCount: number;
  favorite: boolean;
  private: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CommandRow {
  id: number;
  command: string;
  annotation: string | null;
  tags: string | null;
  first_seen: number;
  last_seen: number;
  run_count: number;
  favorite: number;
  private: number;
  created_at: number;
  updated_at: number;
}

export interface InsertCommandInput {
  command: string;
  timestamp?: number;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Convert a database row to a Command object
 */
function rowToCommand(row: CommandRow): Command {
  return {
    id: row.id,
    command: row.command,
    annotation: row.annotation,
    tags: row.tags ? JSON.parse(row.tags) : null,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    runCount: row.run_count,
    favorite: row.favorite === 1,
    private: row.private === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * CommandStore - manages command CRUD operations
 */
export class CommandStore {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private updateTimestampStmt: Database.Statement;
  private findByCommandStmt: Database.Statement;
  private getByIdStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    // Prepare statements for better performance
    this.insertStmt = db.prepare(`
      INSERT INTO commands (command, first_seen, last_seen, run_count)
      VALUES (?, ?, ?, 1)
    `);

    this.updateTimestampStmt = db.prepare(`
      UPDATE commands
      SET last_seen = MAX(last_seen, ?),
          first_seen = MIN(first_seen, ?),
          run_count = run_count + 1,
          updated_at = unixepoch()
      WHERE id = ?
    `);

    this.findByCommandStmt = db.prepare(`
      SELECT * FROM commands WHERE command = ?
    `);

    this.getByIdStmt = db.prepare(`
      SELECT * FROM commands WHERE id = ?
    `);
  }

  /**
   * Insert or update a command
   *
   * If command exists AND we have timestamp data: update timestamps
   * If command exists but no timestamp: skip (no new info)
   * If command is new: insert it
   *
   * @returns 'inserted' | 'updated' | 'skipped'
   */
  upsertCommand(input: InsertCommandInput): 'inserted' | 'updated' | 'skipped' {
    const now = Math.floor(Date.now() / 1000);

    // Check if command already exists
    const existing = this.findByCommandStmt.get(input.command) as CommandRow | undefined;

    if (existing) {
      // Only update if we have actual timestamp data from history file
      // Otherwise we have no new information - skip
      if (input.timestamp !== undefined) {
        this.updateTimestampStmt.run(input.timestamp, input.timestamp, existing.id);
        return 'updated';
      }
      return 'skipped';
    } else {
      // New command - use provided timestamp or now
      const timestamp = input.timestamp ?? now;
      this.insertStmt.run(input.command, timestamp, timestamp);
      return 'inserted';
    }
  }

  /**
   * Bulk import commands efficiently using a transaction
   *
   * @param commands - Array of commands to import
   * @returns ImportResult with statistics
   */
  importCommands(commands: InsertCommandInput[]): ImportResult {
    const result: ImportResult = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const importTransaction = this.db.transaction((cmds: InsertCommandInput[]) => {
      for (const cmd of cmds) {
        try {
          const action = this.upsertCommand(cmd);
          if (action === 'inserted') {
            result.inserted++;
          } else if (action === 'updated') {
            result.updated++;
          } else {
            // 'skipped' - command exists but no new timestamp info
            result.skipped++;
          }
        } catch (error) {
          result.skipped++;
          if (result.errors.length < 10) {
            result.errors.push(`Failed to import "${cmd.command.slice(0, 50)}...": ${error}`);
          }
        }
      }
    });

    importTransaction(commands);
    return result;
  }

  /**
   * Get a command by ID
   */
  getById(id: number): Command | null {
    const row = this.getByIdStmt.get(id) as CommandRow | undefined;
    return row ? rowToCommand(row) : null;
  }

  /**
   * Get a command by exact command text
   */
  getByCommand(command: string): Command | null {
    const row = this.findByCommandStmt.get(command) as CommandRow | undefined;
    return row ? rowToCommand(row) : null;
  }

  /**
   * Get recent commands
   *
   * @param limit - Maximum number of commands to return
   * @param offset - Number of commands to skip
   */
  getRecent(limit: number = 50, offset: number = 0): Command[] {
    const stmt = this.db.prepare(`
      SELECT * FROM commands
      ORDER BY last_seen DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(limit, offset) as CommandRow[];
    return rows.map(rowToCommand);
  }

  /**
   * Get total command count
   */
  getCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM commands').get() as { count: number };
    return result.count;
  }

  /**
   * Update command annotation
   */
  updateAnnotation(id: number, annotation: string | null): boolean {
    const stmt = this.db.prepare(`
      UPDATE commands
      SET annotation = ?, updated_at = unixepoch()
      WHERE id = ?
    `);
    const result = stmt.run(annotation, id);
    return result.changes > 0;
  }

  /**
   * Update command tags
   */
  updateTags(id: number, tags: string[]): boolean {
    const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;
    const stmt = this.db.prepare(`
      UPDATE commands
      SET tags = ?, updated_at = unixepoch()
      WHERE id = ?
    `);
    const result = stmt.run(tagsJson, id);
    return result.changes > 0;
  }

  /**
   * Toggle favorite status
   */
  toggleFavorite(id: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE commands
      SET favorite = NOT favorite, updated_at = unixepoch()
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Set private status
   */
  setPrivate(id: number, isPrivate: boolean): boolean {
    const stmt = this.db.prepare(`
      UPDATE commands
      SET private = ?, updated_at = unixepoch()
      WHERE id = ?
    `);
    const result = stmt.run(isPrivate ? 1 : 0, id);
    return result.changes > 0;
  }

  /**
   * Search commands using FTS5
   *
   * @param query - Search query (supports FTS5 syntax)
   * @param limit - Maximum results
   */
  search(query: string, limit: number = 50): Command[] {
    // Escape special FTS5 characters for safety
    const safeQuery = query.replace(/['"]/g, '');

    const stmt = this.db.prepare(`
      SELECT c.* FROM commands c
      JOIN commands_fts fts ON c.id = fts.rowid
      WHERE commands_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    try {
      const rows = stmt.all(safeQuery, limit) as CommandRow[];
      return rows.map(rowToCommand);
    } catch {
      // If FTS query fails (invalid syntax), fall back to LIKE search
      return this.searchLike(query, limit);
    }
  }

  /**
   * Fallback search using LIKE
   */
  private searchLike(query: string, limit: number): Command[] {
    const stmt = this.db.prepare(`
      SELECT * FROM commands
      WHERE command LIKE ? OR annotation LIKE ? OR tags LIKE ?
      ORDER BY last_seen DESC
      LIMIT ?
    `);
    const pattern = `%${query}%`;
    const rows = stmt.all(pattern, pattern, pattern, limit) as CommandRow[];
    return rows.map(rowToCommand);
  }

  /**
   * Get commands filtered by tag
   */
  getByTag(tag: string, limit: number = 50): Command[] {
    // Tags are stored as JSON array, search for tag in the JSON
    const stmt = this.db.prepare(`
      SELECT * FROM commands
      WHERE tags LIKE ?
      ORDER BY last_seen DESC
      LIMIT ?
    `);
    const pattern = `%"${tag}"%`;
    const rows = stmt.all(pattern, limit) as CommandRow[];
    return rows.map(rowToCommand);
  }

  /**
   * Get favorite commands
   */
  getFavorites(limit: number = 50): Command[] {
    const stmt = this.db.prepare(`
      SELECT * FROM commands
      WHERE favorite = 1
      ORDER BY last_seen DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as CommandRow[];
    return rows.map(rowToCommand);
  }

  /**
   * Delete a command
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM commands WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
