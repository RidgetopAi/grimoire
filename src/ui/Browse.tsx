/**
 * Browse Component
 *
 * Displays a scrollable list of commands with:
 * - Virtualized viewport (shows ~15 items at a time)
 * - Command text, annotations, and tags
 * - Selection highlighting
 * - Favorite indicators
 */

import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Command } from '../services/CommandStore.js';
import { CommandRow } from './components/CommandRow.js';

interface BrowseProps {
  commands: Command[];
  selectedIndex: number;
  onSelect: (command: Command) => void;
  onToggleFavorite: (id: number) => void;
}

const VIEWPORT_SIZE = 15;

export function Browse({ commands, selectedIndex }: BrowseProps) {
  // Calculate viewport window
  const { startIndex, visibleCommands } = useMemo(() => {
    if (commands.length === 0) {
      return { startIndex: 0, visibleCommands: [] };
    }

    // Center the selected item in the viewport when possible
    let start = Math.max(0, selectedIndex - Math.floor(VIEWPORT_SIZE / 2));
    // Don't go past the end
    start = Math.min(start, Math.max(0, commands.length - VIEWPORT_SIZE));

    const end = Math.min(start + VIEWPORT_SIZE, commands.length);
    return {
      startIndex: start,
      visibleCommands: commands.slice(start, end),
    };
  }, [commands, selectedIndex]);

  if (commands.length === 0) {
    return (
      <Box flexDirection="column" paddingY={1} paddingX={2}>
        <Text dimColor>No commands found.</Text>
        <Text dimColor>Run "grimoire import" to import your shell history.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Scroll indicator at top */}
      {startIndex > 0 && (
        <Box paddingLeft={2}>
          <Text dimColor>↑ {startIndex} more commands above</Text>
        </Box>
      )}

      {/* Command list */}
      {visibleCommands.map((cmd, index) => {
        const actualIndex = startIndex + index;
        const isSelected = actualIndex === selectedIndex;
        return (
          <CommandRow
            key={cmd.id}
            command={cmd}
            isSelected={isSelected}
          />
        );
      })}

      {/* Scroll indicator at bottom */}
      {startIndex + visibleCommands.length < commands.length && (
        <Box paddingLeft={2}>
          <Text dimColor>↓ {commands.length - startIndex - visibleCommands.length} more commands below</Text>
        </Box>
      )}
    </Box>
  );
}
