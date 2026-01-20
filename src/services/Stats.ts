/**
 * Statistics Service
 *
 * Calculates and returns statistics about the command history.
 * Follows CONTRACT.md Section 4 stats output format.
 */

import type Database from 'better-sqlite3';

export interface TagStat {
  tag: string;
  count: number;
}

export interface CommandUsageStat {
  command: string;
  count: number;
}

export interface GrimoireStats {
  totalCommands: number;
  annotatedCount: number;
  taggedCount: number;
  favoritesCount: number;
  privateCount: number;
  topTags: TagStat[];
  mostUsed: CommandUsageStat[];
  lastImportTime: number | null;
  oldestCommand: number | null;
  newestCommand: number | null;
}

/**
 * Calculate statistics from the database
 */
export function calculateStats(db: Database.Database): GrimoireStats {
  // Total commands
  const totalResult = db.prepare('SELECT COUNT(*) as count FROM commands').get() as { count: number };
  const totalCommands = totalResult.count;

  // Annotated count
  const annotatedResult = db.prepare(
    "SELECT COUNT(*) as count FROM commands WHERE annotation IS NOT NULL AND annotation != ''"
  ).get() as { count: number };
  const annotatedCount = annotatedResult.count;

  // Tagged count
  const taggedResult = db.prepare(
    "SELECT COUNT(*) as count FROM commands WHERE tags IS NOT NULL AND tags != '[]' AND tags != ''"
  ).get() as { count: number };
  const taggedCount = taggedResult.count;

  // Favorites count
  const favoritesResult = db.prepare(
    'SELECT COUNT(*) as count FROM commands WHERE favorite = 1'
  ).get() as { count: number };
  const favoritesCount = favoritesResult.count;

  // Private count
  const privateResult = db.prepare(
    'SELECT COUNT(*) as count FROM commands WHERE private = 1'
  ).get() as { count: number };
  const privateCount = privateResult.count;

  // Top tags - need to parse JSON and aggregate
  const topTags = getTopTags(db, 10);

  // Most used commands
  const mostUsedResult = db.prepare(`
    SELECT command, run_count as count
    FROM commands
    WHERE run_count > 1
    ORDER BY run_count DESC
    LIMIT 10
  `).all() as { command: string; count: number }[];

  const mostUsed: CommandUsageStat[] = mostUsedResult.map(row => ({
    command: row.command.length > 60 ? row.command.slice(0, 57) + '...' : row.command,
    count: row.count,
  }));

  // Time range
  const timeRangeResult = db.prepare(`
    SELECT
      MIN(first_seen) as oldest,
      MAX(last_seen) as newest,
      MAX(updated_at) as lastImport
    FROM commands
  `).get() as { oldest: number | null; newest: number | null; lastImport: number | null };

  return {
    totalCommands,
    annotatedCount,
    taggedCount,
    favoritesCount,
    privateCount,
    topTags,
    mostUsed,
    lastImportTime: timeRangeResult.lastImport,
    oldestCommand: timeRangeResult.oldest,
    newestCommand: timeRangeResult.newest,
  };
}

/**
 * Extract and count tags from all commands
 * Tags are stored as JSON arrays, so we need to parse and aggregate
 */
function getTopTags(db: Database.Database, limit: number): TagStat[] {
  // Get all non-null tags
  const rows = db.prepare(
    "SELECT tags FROM commands WHERE tags IS NOT NULL AND tags != ''"
  ).all() as { tags: string }[];

  // Count each tag
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    try {
      const tags = JSON.parse(row.tags) as string[];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    } catch {
      // Skip invalid JSON
    }
  }

  // Sort by count and return top N
  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Format relative time from Unix timestamp
 */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;

  return `${Math.floor(diff / 2592000)} months ago`;
}

/**
 * Format stats for CLI output
 * Follows CONTRACT.md Section 4 stats output format
 */
export function formatStats(stats: GrimoireStats): string {
  const lines: string[] = [];

  lines.push('Grimoire Statistics');
  lines.push('==================');
  lines.push('');

  // Basic counts
  const annotatedPct = stats.totalCommands > 0
    ? Math.round((stats.annotatedCount / stats.totalCommands) * 100)
    : 0;
  const taggedPct = stats.totalCommands > 0
    ? Math.round((stats.taggedCount / stats.totalCommands) * 100)
    : 0;

  lines.push(`Total commands:     ${stats.totalCommands}`);
  lines.push(`Annotated:          ${stats.annotatedCount} (${annotatedPct}%)`);
  lines.push(`Tagged:             ${stats.taggedCount} (${taggedPct}%)`);
  lines.push(`Favorites:          ${stats.favoritesCount}`);

  if (stats.privateCount > 0) {
    lines.push(`Private:            ${stats.privateCount}`);
  }

  // Top tags
  if (stats.topTags.length > 0) {
    lines.push('');
    lines.push('Top Tags:');
    for (const { tag, count } of stats.topTags.slice(0, 5)) {
      const padding = ' '.repeat(Math.max(0, 12 - tag.length));
      lines.push(`  #${tag}${padding}${count} commands`);
    }
  }

  // Most used
  if (stats.mostUsed.length > 0) {
    lines.push('');
    lines.push('Most Used:');
    for (const { command, count } of stats.mostUsed.slice(0, 5)) {
      const padding = ' '.repeat(Math.max(0, 18 - command.length));
      lines.push(`  ${command}${padding}${count} times`);
    }
  }

  // Last import time
  if (stats.lastImportTime) {
    lines.push('');
    lines.push(`Last updated: ${formatRelativeTime(stats.lastImportTime)}`);
  }

  return lines.join('\n');
}

/**
 * Get stats as JSON for programmatic access
 */
export function getStatsJson(stats: GrimoireStats): object {
  return {
    total: stats.totalCommands,
    annotated: {
      count: stats.annotatedCount,
      percentage: stats.totalCommands > 0
        ? Math.round((stats.annotatedCount / stats.totalCommands) * 100)
        : 0,
    },
    tagged: {
      count: stats.taggedCount,
      percentage: stats.totalCommands > 0
        ? Math.round((stats.taggedCount / stats.totalCommands) * 100)
        : 0,
    },
    favorites: stats.favoritesCount,
    private: stats.privateCount,
    topTags: stats.topTags,
    mostUsed: stats.mostUsed,
    timeRange: {
      oldest: stats.oldestCommand,
      newest: stats.newestCommand,
      lastUpdated: stats.lastImportTime,
    },
  };
}
