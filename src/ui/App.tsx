/**
 * Main TUI Application Component
 *
 * Manages application state and mode switching between:
 * - browse: Main command list view
 * - search: Search input active
 * - detail: Viewing a single command
 * - help: Showing keyboard shortcuts
 */

import { useState, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type Database from 'better-sqlite3';
import { CommandStore, type Command } from '../services/CommandStore.js';
import { Browse } from './Browse.js';
import { Search } from './Search.js';
import { Detail } from './Detail.js';
import { Help } from './Help.js';

export type Mode = 'browse' | 'search' | 'detail' | 'help';

interface AppProps {
  db: Database.Database;
}

export function App({ db }: AppProps) {
  const { exit } = useApp();
  const store = useMemo(() => new CommandStore(db), [db]);

  // Application state
  const [mode, setMode] = useState<Mode>('browse');
  const [commands, setCommands] = useState<Command[]>(() => store.getRecent(100));
  const [filteredCommands, setFilteredCommands] = useState<Command[]>(commands);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);

  // Refresh commands from database
  const refreshCommands = useCallback(() => {
    const fresh = store.getRecent(100);
    setCommands(fresh);
    if (searchQuery) {
      // Re-apply search if active
      const results = store.search(searchQuery, 100);
      setFilteredCommands(results);
    } else {
      setFilteredCommands(fresh);
    }
  }, [store, searchQuery]);

  // Handle search
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = store.search(query, 100);
      setFilteredCommands(results);
    } else {
      setFilteredCommands(commands);
    }
    setSelectedIndex(0);
  }, [store, commands]);

  // Handle command selection (enter detail view)
  const handleSelectCommand = useCallback((command: Command) => {
    setSelectedCommand(command);
    setMode('detail');
  }, []);

  // Handle back from detail view
  const handleBack = useCallback(() => {
    setMode('browse');
    setSelectedCommand(null);
    refreshCommands(); // Refresh in case command was modified
  }, [refreshCommands]);

  // Handle favorite toggle
  const handleToggleFavorite = useCallback((id: number) => {
    store.toggleFavorite(id);
    refreshCommands();
    // Update selected command if in detail view
    if (selectedCommand && selectedCommand.id === id) {
      const updated = store.getById(id);
      if (updated) setSelectedCommand(updated);
    }
  }, [store, refreshCommands, selectedCommand]);

  // Handle annotation update
  const handleUpdateAnnotation = useCallback((id: number, annotation: string | null) => {
    store.updateAnnotation(id, annotation);
    refreshCommands();
    // Update selected command if in detail view
    if (selectedCommand && selectedCommand.id === id) {
      const updated = store.getById(id);
      if (updated) setSelectedCommand(updated);
    }
  }, [store, refreshCommands, selectedCommand]);

  // Handle tags update
  const handleUpdateTags = useCallback((id: number, tags: string[]) => {
    store.updateTags(id, tags);
    refreshCommands();
    if (selectedCommand && selectedCommand.id === id) {
      const updated = store.getById(id);
      if (updated) setSelectedCommand(updated);
    }
  }, [store, refreshCommands, selectedCommand]);

  // Global keyboard handling
  useInput((input, key) => {
    // Global shortcuts
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (mode === 'help') {
      // Any key exits help
      if (key.escape || input === 'q' || input === '?') {
        setMode('browse');
      }
      return;
    }

    if (mode === 'detail') {
      // Detail view handles its own input
      return;
    }

    if (mode === 'search') {
      // Search mode handles input via TextInput
      if (key.escape) {
        setMode('browse');
        handleSearch('');
      } else if (key.return) {
        setMode('browse');
      }
      return;
    }

    // Browse mode
    if (input === 'q') {
      exit();
      return;
    }

    if (input === '?') {
      setMode('help');
      return;
    }

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
    if (input === 'g') {
      setSelectedIndex(0);
    }
    if (input === 'G') {
      setSelectedIndex(filteredCommands.length - 1);
    }

    // Actions on selected command
    const currentCommand = filteredCommands[selectedIndex];
    if (!currentCommand) return;

    if (key.return) {
      handleSelectCommand(currentCommand);
    }
    if (input === 'f') {
      handleToggleFavorite(currentCommand.id);
    }
  });

  // Render based on mode
  if (mode === 'help') {
    return <Help onClose={() => setMode('browse')} />;
  }

  if (mode === 'detail' && selectedCommand) {
    return (
      <Detail
        command={selectedCommand}
        onBack={handleBack}
        onToggleFavorite={() => handleToggleFavorite(selectedCommand.id)}
        onUpdateAnnotation={(annotation) => handleUpdateAnnotation(selectedCommand.id, annotation)}
        onUpdateTags={(tags) => handleUpdateTags(selectedCommand.id, tags)}
      />
    );
  }

  const totalCount = store.getCount();

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box borderStyle="single" paddingX={1}>
        <Text bold color="cyan">📖 GRIMOIRE</Text>
        <Box flexGrow={1} />
        <Text dimColor>{totalCount} commands</Text>
        <Text> </Text>
        <Text dimColor>[?] Help  [q] Quit</Text>
      </Box>

      {/* Search bar */}
      <Search
        isActive={mode === 'search'}
        query={searchQuery}
        onQueryChange={handleSearch}
        resultCount={filteredCommands.length}
      />

      {/* Command list */}
      <Browse
        commands={filteredCommands}
        selectedIndex={selectedIndex}
        onSelect={handleSelectCommand}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          ↑↓ Navigate   Enter Detail   f Favorite   / Search   ? Help   q Quit
        </Text>
      </Box>
    </Box>
  );
}
