/**
 * Export Module
 *
 * Main entry point for export functionality.
 * Supports JSON and Markdown formats with secret redaction.
 */

import type Database from 'better-sqlite3';
import { CommandStore, type Command } from '../services/CommandStore.js';
import { exportJsonString, type JsonExportOptions } from './json.js';
import { exportMarkdown, type MarkdownExportOptions } from './markdown.js';

export type ExportFormat = 'json' | 'markdown';

export interface ExportOptions {
  format: ExportFormat;
  includePrivate: boolean;
  redactSecrets: boolean;
}

const DEFAULT_OPTIONS: ExportOptions = {
  format: 'json',
  includePrivate: false,
  redactSecrets: true,
};

/**
 * Get all commands from the database for export
 */
function getAllCommands(db: Database.Database): Command[] {
  const store = new CommandStore(db);
  // Get all commands (large limit to get everything)
  return store.getRecent(100000, 0);
}

/**
 * Run export with the specified options
 *
 * @param db - Database connection
 * @param options - Export options
 * @returns Formatted export string
 */
export function runExport(
  db: Database.Database,
  options: Partial<ExportOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get all commands
  const commands = getAllCommands(db);

  if (opts.format === 'json') {
    const jsonOptions: Partial<JsonExportOptions> = {
      includePrivate: opts.includePrivate,
      redactSecrets: opts.redactSecrets,
    };
    return exportJsonString(commands, jsonOptions, true);
  } else {
    const mdOptions: Partial<MarkdownExportOptions> = {
      includePrivate: opts.includePrivate,
      redactSecrets: opts.redactSecrets,
      groupByCategory: true,
    };
    return exportMarkdown(commands, mdOptions);
  }
}

// Re-export for direct access
export { exportJsonString, exportJson } from './json.js';
export { exportMarkdown, exportMarkdownSummary } from './markdown.js';
export { redactSecrets, hasSecrets, detectSecretTypes } from './redact.js';
export type { JsonExport, ExportedCommand, JsonExportOptions } from './json.js';
export type { MarkdownExportOptions } from './markdown.js';
export type { RedactionResult } from './redact.js';
