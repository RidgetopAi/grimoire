/**
 * Markdown Export
 *
 * Export commands in Markdown format for human reading.
 * Groups commands by common prefixes/categories for readability.
 */

import type { Command } from '../services/CommandStore.js';
import { redactSecrets } from './redact.js';

export interface MarkdownExportOptions {
  includePrivate: boolean;
  redactSecrets: boolean;
  groupByCategory: boolean;
}

const DEFAULT_OPTIONS: MarkdownExportOptions = {
  includePrivate: false,
  redactSecrets: true,
  groupByCategory: true,
};

/**
 * Format a relative time string
 */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;

  // For older timestamps, use date
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString();
}

/**
 * Get the category for a command based on its first word
 */
function getCategory(command: string): string {
  const firstWord = command.trim().split(/\s+/)[0].toLowerCase();

  // Map common commands to categories
  const categoryMap: Record<string, string> = {
    git: 'Git',
    docker: 'Docker',
    kubectl: 'Kubernetes',
    npm: 'Node.js',
    yarn: 'Node.js',
    pnpm: 'Node.js',
    python: 'Python',
    pip: 'Python',
    cargo: 'Rust',
    go: 'Go',
    aws: 'AWS',
    gcloud: 'Google Cloud',
    az: 'Azure',
    ssh: 'SSH',
    scp: 'SSH',
    rsync: 'File Transfer',
    curl: 'HTTP',
    wget: 'HTTP',
    cd: 'Navigation',
    ls: 'Navigation',
    cat: 'File Operations',
    grep: 'Search',
    find: 'Search',
    rg: 'Search',
    vim: 'Editing',
    nvim: 'Editing',
    nano: 'Editing',
    code: 'Editing',
    make: 'Build',
    cmake: 'Build',
  };

  return categoryMap[firstWord] || 'Other';
}

/**
 * Escape special Markdown characters in command text
 */
function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_');
}

/**
 * Format a single command as Markdown
 */
function formatCommand(cmd: Command, shouldRedact: boolean): string {
  const commandText = shouldRedact
    ? redactSecrets(cmd.command).redacted
    : cmd.command;

  const lines: string[] = [];

  // Command as code block header
  lines.push(`### \`${escapeMarkdown(commandText.slice(0, 80))}${commandText.length > 80 ? '...' : ''}\``);
  lines.push('');

  // Full command if truncated
  if (commandText.length > 80) {
    lines.push('```bash');
    lines.push(commandText);
    lines.push('```');
    lines.push('');
  }

  // Annotation
  if (cmd.annotation) {
    lines.push(`- **Annotation**: ${cmd.annotation}`);
  }

  // Tags
  if (cmd.tags && cmd.tags.length > 0) {
    lines.push(`- **Tags**: ${cmd.tags.join(', ')}`);
  }

  // Usage stats
  const usageInfo = cmd.runCount > 1
    ? `${cmd.runCount} times (last: ${formatRelativeTime(cmd.lastSeen)})`
    : formatRelativeTime(cmd.lastSeen);
  lines.push(`- **Used**: ${usageInfo}`);

  // Favorite status
  if (cmd.favorite) {
    lines.push('- **Favorite**: Yes');
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Group commands by category
 */
function groupByCategory(commands: Command[]): Map<string, Command[]> {
  const groups = new Map<string, Command[]>();

  for (const cmd of commands) {
    const category = getCategory(cmd.command);
    const existing = groups.get(category) || [];
    existing.push(cmd);
    groups.set(category, existing);
  }

  return groups;
}

/**
 * Export commands as Markdown
 *
 * @param commands - Array of commands to export
 * @param options - Export options
 * @returns Markdown string
 */
export function exportMarkdown(
  commands: Command[],
  options: Partial<MarkdownExportOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Filter private commands unless explicitly included
  const filteredCommands = opts.includePrivate
    ? commands
    : commands.filter(cmd => !cmd.private);

  const lines: string[] = [];

  // Header
  lines.push('# Command History Export');
  lines.push('');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Total Commands: ${filteredCommands.length}`);
  lines.push('');

  if (filteredCommands.length === 0) {
    lines.push('*No commands to export.*');
    return lines.join('\n');
  }

  if (opts.groupByCategory) {
    // Group by category
    const groups = groupByCategory(filteredCommands);

    // Sort categories by command count (descending)
    const sortedCategories = Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length);

    for (const [category, categoryCommands] of sortedCategories) {
      lines.push(`## ${category} Commands`);
      lines.push('');

      // Sort commands by last seen (most recent first)
      const sortedCommands = categoryCommands.sort((a, b) => b.lastSeen - a.lastSeen);

      for (const cmd of sortedCommands) {
        lines.push(formatCommand(cmd, opts.redactSecrets));
      }
    }
  } else {
    // No grouping, just sort by last seen
    const sortedCommands = filteredCommands.sort((a, b) => b.lastSeen - a.lastSeen);

    lines.push('## All Commands');
    lines.push('');

    for (const cmd of sortedCommands) {
      lines.push(formatCommand(cmd, opts.redactSecrets));
    }
  }

  return lines.join('\n');
}

/**
 * Export commands as a summary table in Markdown
 * Useful for quick overview without full details
 */
export function exportMarkdownSummary(
  commands: Command[],
  options: Partial<MarkdownExportOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Filter private commands unless explicitly included
  const filteredCommands = opts.includePrivate
    ? commands
    : commands.filter(cmd => !cmd.private);

  const lines: string[] = [];

  // Header
  lines.push('# Command History Summary');
  lines.push('');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Total Commands: ${filteredCommands.length}`);
  lines.push('');

  if (filteredCommands.length === 0) {
    lines.push('*No commands to export.*');
    return lines.join('\n');
  }

  // Table header
  lines.push('| Command | Annotation | Tags | Used |');
  lines.push('|---------|------------|------|------|');

  // Sort by last seen (most recent first)
  const sortedCommands = filteredCommands.sort((a, b) => b.lastSeen - a.lastSeen);

  for (const cmd of sortedCommands) {
    const commandText = opts.redactSecrets
      ? redactSecrets(cmd.command).redacted
      : cmd.command;

    // Truncate command for table
    const truncatedCmd = commandText.length > 50
      ? `${commandText.slice(0, 47)}...`
      : commandText;

    // Escape pipe characters for table
    const safeCmd = truncatedCmd.replace(/\|/g, '\\|');
    const annotation = (cmd.annotation || '-').replace(/\|/g, '\\|');
    const tags = cmd.tags && cmd.tags.length > 0
      ? cmd.tags.slice(0, 3).join(', ')
      : '-';
    const used = `${cmd.runCount}x`;

    lines.push(`| \`${safeCmd}\` | ${annotation} | ${tags} | ${used} |`);
  }

  return lines.join('\n');
}
