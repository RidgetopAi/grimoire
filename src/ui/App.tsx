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
import clipboardy from 'clipboardy';
import { CommandStore, type Command } from '../services/CommandStore.js';
import { Browse } from './Browse.js';
import { Search } from './Search.js';
import { Detail } from './Detail.js';
import { Help } from './Help.js';
import { QuickEdit } from './components/QuickEdit.js';
import { ConfirmExecute } from './components/ConfirmExecute.js';

export type Mode = 'browse' | 'search' | 'detail' | 'help';
export type QuickEditType = 'annotation' | 'tags' | null;

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
  const [quickEditType, setQuickEditType] = useState<QuickEditType>(null);
  const [confirmExecuteCommand, setConfirmExecuteCommand] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

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

  // Handle private toggle
  const handleTogglePrivate = useCallback((id: number) => {
    const cmd = store.getById(id);
    if (cmd) {
      store.setPrivate(id, !cmd.private);
      refreshCommands();
      if (selectedCommand && selectedCommand.id === id) {
        const updated = store.getById(id);
        if (updated) setSelectedCommand(updated);
      }
    }
  }, [store, refreshCommands, selectedCommand]);

  // Global keyboard handling
  useInput((input, key) => {
    // Global shortcuts
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    // Quick edit mode handles its own input
    if (quickEditType !== null) {
      return;
    }

    // Execute confirmation handles its own input
    if (confirmExecuteCommand !== null) {
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
    if (input === 'a') {
      setQuickEditType('annotation');
    }
    if (input === 't') {
      setQuickEditType('tags');
    }
    if (input === 'x') {
      setConfirmExecuteCommand(currentCommand.command);
    }
    if (input === 'y') {
      try {
        clipboardy.writeSync(currentCommand.command);
        setCopyMessage('Copied to clipboard!');
        setTimeout(() => setCopyMessage(null), 2000);
      } catch {
        setCopyMessage('Failed to copy');
        setTimeout(() => setCopyMessage(null), 2000);
      }
    }
  });

  // Handle quick edit save
  const handleQuickEditSave = useCallback((value: string) => {
    const currentCommand = filteredCommands[selectedIndex];
    if (!currentCommand) {
      setQuickEditType(null);
      return;
    }

    if (quickEditType === 'annotation') {
      handleUpdateAnnotation(currentCommand.id, value.trim() || null);
    } else if (quickEditType === 'tags') {
      const tags = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
      handleUpdateTags(currentCommand.id, tags);
    }
    setQuickEditType(null);
  }, [filteredCommands, selectedIndex, quickEditType, handleUpdateAnnotation, handleUpdateTags]);

  // Handle execute confirmation
  const handleExecuteConfirm = useCallback(() => {
    if (confirmExecuteCommand) {
      // Exit the TUI and execute the command
      // We'll write the command to stdout and let the shell execute it
      // This is a common pattern - exit with the command as output
      exit();
      console.log('\n\x1b[33mExecuting:\x1b[0m ' + confirmExecuteCommand);
      // Use exec to run the command
      import('child_process').then(({ exec }) => {
        exec(confirmExecuteCommand, { cwd: process.cwd() }, (error, stdout, stderr) => {
          if (error) {
            console.error('\x1b[31mError:\x1b[0m', error.message);
          }
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
        });
      });
    }
  }, [confirmExecuteCommand, exit]);

  // Render based on mode
  if (mode === 'help') {
    return <Help onClose={() => setMode('browse')} />;
  }

  if (mode === 'detail' && selectedCommand) {
    return (
      <Box flexDirection="column">
        <Detail
          command={selectedCommand}
          onBack={handleBack}
          onToggleFavorite={() => handleToggleFavorite(selectedCommand.id)}
          onTogglePrivate={() => handleTogglePrivate(selectedCommand.id)}
          onUpdateAnnotation={(annotation) => handleUpdateAnnotation(selectedCommand.id, annotation)}
          onUpdateTags={(tags) => handleUpdateTags(selectedCommand.id, tags)}
          onExecute={() => setConfirmExecuteCommand(selectedCommand.command)}
        />
        {/* Execute confirmation overlay in detail view */}
        {confirmExecuteCommand !== null && (
          <ConfirmExecute
            command={confirmExecuteCommand}
            onConfirm={handleExecuteConfirm}
            onCancel={() => setConfirmExecuteCommand(null)}
          />
        )}
      </Box>
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

      {/* Quick edit overlay */}
      {quickEditType !== null && filteredCommands[selectedIndex] && (
        <QuickEdit
          command={filteredCommands[selectedIndex]}
          editType={quickEditType}
          onSave={handleQuickEditSave}
          onCancel={() => setQuickEditType(null)}
        />
      )}

      {/* Execute confirmation overlay */}
      {confirmExecuteCommand !== null && (
        <ConfirmExecute
          command={confirmExecuteCommand}
          onConfirm={handleExecuteConfirm}
          onCancel={() => setConfirmExecuteCommand(null)}
        />
      )}

      {/* Copy message */}
      {copyMessage && (
        <Box paddingX={2}>
          <Text color="green">✓ {copyMessage}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          ↑↓ Navigate   Enter   a Annotate   t Tags   f Fav   y Copy   x Execute   / Search   ? Help   q Quit
        </Text>
      </Box>
    </Box>
  );
}
