/**
 * JSON Export
 *
 * Export commands in JSON format following CONTRACT.md Section 5 specification.
 * This format is designed for AI tools and programmatic access.
 */

import type { Command } from '../services/CommandStore.js';
import { redactSecrets } from './redact.js';

export interface ExportedCommand {
  id: number;
  command: string;
  annotation: string | null;
  tags: string[];
  firstSeen: string;  // ISO 8601 timestamp
  lastSeen: string;   // ISO 8601 timestamp
  runCount: number;
  favorite: boolean;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface CommandCount {
  command: string;
  count: number;
}

export interface ExportStatistics {
  topTags: TagCount[];
  mostUsed: CommandCount[];
}

export interface JsonExport {
  version: string;
  exportedAt: string;
  totalCommands: number;
  commands: ExportedCommand[];
  statistics: ExportStatistics;
}

export interface JsonExportOptions {
  includePrivate: boolean;
  redactSecrets: boolean;
  topTagsLimit: number;
  mostUsedLimit: number;
}

const DEFAULT_OPTIONS: JsonExportOptions = {
  includePrivate: false,
  redactSecrets: true,
  topTagsLimit: 10,
  mostUsedLimit: 10,
};

/**
 * Convert Unix timestamp to ISO 8601 string
 */
function toISOString(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toISOString();
}

/**
 * Convert a Command to the export format
 */
function commandToExport(cmd: Command, shouldRedact: boolean): ExportedCommand {
  const commandText = shouldRedact
    ? redactSecrets(cmd.command).redacted
    : cmd.command;

  return {
    id: cmd.id,
    command: commandText,
    annotation: cmd.annotation,
    tags: cmd.tags ?? [],
    firstSeen: toISOString(cmd.firstSeen),
    lastSeen: toISOString(cmd.lastSeen),
    runCount: cmd.runCount,
    favorite: cmd.favorite,
  };
}

/**
 * Calculate statistics for the export
 */
function calculateStatistics(
  commands: Command[],
  topTagsLimit: number,
  mostUsedLimit: number
): ExportStatistics {
  // Count tags
  const tagCounts = new Map<string, number>();
  for (const cmd of commands) {
    if (cmd.tags) {
      for (const tag of cmd.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
  }

  // Sort tags by count
  const topTags: TagCount[] = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topTagsLimit);

  // Sort commands by run count
  const mostUsed: CommandCount[] = commands
    .filter(cmd => cmd.runCount > 1)
    .map(cmd => ({
      command: cmd.command.slice(0, 100),  // Truncate for readability
      count: cmd.runCount,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, mostUsedLimit);

  return {
    topTags,
    mostUsed,
  };
}

/**
 * Export commands as JSON
 *
 * @param commands - Array of commands to export
 * @param options - Export options
 * @returns JSON export object
 */
export function exportJson(
  commands: Command[],
  options: Partial<JsonExportOptions> = {}
): JsonExport {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Filter private commands unless explicitly included
  const filteredCommands = opts.includePrivate
    ? commands
    : commands.filter(cmd => !cmd.private);

  // Convert commands to export format
  const exportedCommands = filteredCommands.map(cmd =>
    commandToExport(cmd, opts.redactSecrets)
  );

  // Calculate statistics (use original commands for counts, not redacted)
  const statistics = calculateStatistics(
    filteredCommands,
    opts.topTagsLimit,
    opts.mostUsedLimit
  );

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    totalCommands: exportedCommands.length,
    commands: exportedCommands,
    statistics,
  };
}

/**
 * Export commands as JSON string
 *
 * @param commands - Array of commands to export
 * @param options - Export options
 * @param pretty - Whether to format with indentation
 * @returns JSON string
 */
export function exportJsonString(
  commands: Command[],
  options: Partial<JsonExportOptions> = {},
  pretty: boolean = true
): string {
  const data = exportJson(commands, options);
  return pretty
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
}
