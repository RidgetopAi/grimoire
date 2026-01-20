/**
 * Ink TUI Prototype for Grimoire
 * Instance #2 - Technical Validation
 *
 * Tests: Box layouts, useInput, scrollable list, search mode
 */

import React, { useState, useCallback } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';

interface Command {
  id: number;
  command: string;
  annotation?: string;
  tags?: string[];
  runCount: number;
  lastSeen: string;
}

// Sample data
const SAMPLE_COMMANDS: Command[] = [
  { id: 1, command: 'git push origin main', annotation: 'Deploy to production', tags: ['git', 'deploy'], runCount: 47, lastSeen: '2h ago' },
  { id: 2, command: 'docker compose up -d', annotation: 'Start local dev environment', tags: ['docker', 'dev'], runCount: 123, lastSeen: '5h ago' },
  { id: 3, command: 'ssh hetzner', annotation: 'Connect to VPS', tags: ['ssh', 'remote'], runCount: 89, lastSeen: '12h ago' },
  { id: 4, command: 'npm run build', annotation: 'Build for production', tags: ['npm', 'build'], runCount: 56, lastSeen: '1d ago' },
  { id: 5, command: 'psql -d aidis_production', annotation: 'Connect to production database', tags: ['postgres', 'db'], runCount: 34, lastSeen: '2d ago' },
  { id: 6, command: 'git status', runCount: 234, lastSeen: '1h ago' },
  { id: 7, command: 'cd ~/projects', runCount: 456, lastSeen: '30m ago' },
  { id: 8, command: 'ls -la', annotation: 'List with details', tags: ['basics'], runCount: 789, lastSeen: '15m ago' },
  { id: 9, command: 'vim ~/.bashrc', annotation: 'Edit shell config', tags: ['config'], runCount: 12, lastSeen: '1w ago' },
  { id: 10, command: 'curl -s http://localhost:8080/health', annotation: 'Health check', tags: ['api', 'debug'], runCount: 67, lastSeen: '3h ago' },
];

type Mode = 'browse' | 'search' | 'help';

function CommandRow({ cmd, isSelected }: { cmd: Command; isSelected: boolean }) {
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box>
        <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
          {isSelected ? '▸ ' : '  '}
        </Text>
        <Text bold color={isSelected ? 'white' : undefined}>
          {cmd.command.length > 60 ? cmd.command.slice(0, 57) + '...' : cmd.command}
        </Text>
        <Text> </Text>
        <Text dimColor>{cmd.lastSeen}</Text>
      </Box>
      {cmd.annotation && (
        <Box paddingLeft={4}>
          <Text color="cyan">✏️  "{cmd.annotation}"</Text>
        </Box>
      )}
      {cmd.tags && cmd.tags.length > 0 && (
        <Box paddingLeft={4}>
          {cmd.tags.map((tag, i) => (
            <Text key={tag} dimColor color="magenta">
              [{tag}]{i < cmd.tags!.length - 1 ? ' ' : ''}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function HelpScreen({ onClose }: { onClose: () => void }) {
  useInput((input, key) => {
    if (key.escape || input === 'q' || input === '?') {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">📖 GRIMOIRE - Keyboard Shortcuts</Text>
      <Text> </Text>
      <Text bold>Navigation:</Text>
      <Text>  ↑/↓ or j/k  Move selection</Text>
      <Text>  g/G         Jump to top/bottom</Text>
      <Text>  Enter       View command details</Text>
      <Text> </Text>
      <Text bold>Actions:</Text>
      <Text>  /           Enter search mode</Text>
      <Text>  a           Add/edit annotation</Text>
      <Text>  t           Edit tags</Text>
      <Text>  f           Toggle favorite</Text>
      <Text>  y           Copy command to clipboard</Text>
      <Text>  x           Execute command</Text>
      <Text> </Text>
      <Text bold>General:</Text>
      <Text>  ?           Show this help</Text>
      <Text>  q           Quit</Text>
      <Text> </Text>
      <Text dimColor>Press any key to close...</Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>('browse');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCommands, setFilteredCommands] = useState(SAMPLE_COMMANDS);

  const filterCommands = useCallback((query: string) => {
    if (!query.trim()) {
      setFilteredCommands(SAMPLE_COMMANDS);
      return;
    }
    const lower = query.toLowerCase();
    const filtered = SAMPLE_COMMANDS.filter(cmd =>
      cmd.command.toLowerCase().includes(lower) ||
      cmd.annotation?.toLowerCase().includes(lower) ||
      cmd.tags?.some(t => t.toLowerCase().includes(lower))
    );
    setFilteredCommands(filtered);
    setSelectedIndex(0);
  }, []);

  useInput((input, key) => {
    if (mode === 'help') return;

    if (mode === 'search') {
      if (key.escape) {
        setMode('browse');
        setSearchQuery('');
        filterCommands('');
      } else if (key.return) {
        setMode('browse');
      }
      return;
    }

    // Browse mode
    if (input === 'q') exit();
    if (input === '?') setMode('help');
    if (input === '/') {
      setMode('search');
      return;
    }

    // Navigation
    if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
    }
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(i - 1, 0));
    }
    if (input === 'g') setSelectedIndex(0);
    if (input === 'G') setSelectedIndex(filteredCommands.length - 1);
  });

  if (mode === 'help') {
    return <HelpScreen onClose={() => setMode('browse')} />;
  }

  return (
    <Box flexDirection="column" height={20}>
      {/* Header */}
      <Box borderStyle="single" paddingX={1}>
        <Text bold color="cyan">📖 GRIMOIRE</Text>
        <Box flexGrow={1} />
        <Text dimColor>[?] Help  [q] Quit</Text>
      </Box>

      {/* Search bar */}
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text>🔍 Search: </Text>
        {mode === 'search' ? (
          <TextInput
            value={searchQuery}
            onChange={(value) => {
              setSearchQuery(value);
              filterCommands(value);
            }}
            placeholder="Type to filter..."
          />
        ) : (
          <Text dimColor>{searchQuery || 'Press / to search'}</Text>
        )}
        <Box flexGrow={1} />
        <Text dimColor>[/] Focus  [Esc] Clear</Text>
      </Box>

      {/* Results count */}
      {searchQuery && (
        <Box paddingX={1}>
          <Text dimColor>
            Showing {filteredCommands.length} results for "{searchQuery}"
          </Text>
        </Box>
      )}

      {/* Command list */}
      <Box flexDirection="column" flexGrow={1} paddingY={1}>
        {filteredCommands.slice(0, 8).map((cmd, index) => (
          <CommandRow
            key={cmd.id}
            cmd={cmd}
            isSelected={index === selectedIndex}
          />
        ))}
        {filteredCommands.length === 0 && (
          <Box paddingLeft={2}>
            <Text dimColor>No commands match your search</Text>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          ↑↓ Navigate   Enter Detail   a Annotate   t Tag   f Favorite   / Search
        </Text>
      </Box>
    </Box>
  );
}

render(<App />);
