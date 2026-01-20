/**
 * CommandRow Component
 *
 * Displays a single command entry in the browse list with:
 * - Command text (truncated if too long)
 * - Annotation (if present)
 * - Tags (if present)
 * - Favorite indicator
 * - Relative timestamp
 */

import { Box, Text } from 'ink';
import type { Command } from '../../services/CommandStore.js';

interface CommandRowProps {
  command: Command;
  isSelected: boolean;
}

/**
 * Format a Unix timestamp as a relative time string
 */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

/**
 * Truncate a string to fit in terminal width
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function CommandRow({ command, isSelected }: CommandRowProps) {
  const timeStr = formatRelativeTime(command.lastSeen);
  const favoriteIcon = command.favorite ? '★ ' : '  ';

  return (
    <Box flexDirection="column" paddingLeft={1} marginBottom={0}>
      {/* Main command line */}
      <Box>
        <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
          {isSelected ? '▸ ' : '  '}
        </Text>
        <Text color="yellow">{favoriteIcon}</Text>
        <Text bold color={isSelected ? 'white' : undefined}>
          {truncate(command.command, 60)}
        </Text>
        <Box flexGrow={1} />
        <Text dimColor> {timeStr}</Text>
      </Box>

      {/* Annotation line (if present) */}
      {command.annotation && (
        <Box paddingLeft={6}>
          <Text color="cyan">✏️  "{truncate(command.annotation, 55)}"</Text>
        </Box>
      )}

      {/* Tags line (if present) */}
      {command.tags && command.tags.length > 0 && (
        <Box paddingLeft={6}>
          {command.tags.map((tag, i) => (
            <Text key={tag} dimColor color="magenta">
              [{tag}]{i < command.tags!.length - 1 ? ' ' : ''}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
