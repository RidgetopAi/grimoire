/**
 * Welcome Screen Component
 *
 * First-run experience when the database is empty.
 * Shows detected history files and offers to import them.
 */

import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type Database from 'better-sqlite3';
import {
  detectHistoryFiles,
  formatFileSize,
  type HistoryFile,
} from '../import/detect.js';
import { runImport, type ImportProgress } from '../import/index.js';

export type WelcomeMode = 'prompt' | 'importing' | 'complete' | 'error';

interface WelcomeProps {
  db: Database.Database;
  onComplete: () => void;
  onSkip: () => void;
}

interface ImportStats {
  phase: string;
  current: number;
  total: number;
  inserted: number;
  updated: number;
}

export function Welcome({ db, onComplete, onSkip }: WelcomeProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<WelcomeMode>('prompt');
  const [historyFiles, setHistoryFiles] = useState<HistoryFile[]>([]);
  const [stats, setStats] = useState<ImportStats>({
    phase: 'detecting',
    current: 0,
    total: 0,
    inserted: 0,
    updated: 0,
  });
  const [error, setError] = useState<string | null>(null);

  // Detect history files on mount
  useEffect(() => {
    const detection = detectHistoryFiles();
    setHistoryFiles(detection.files);
  }, []);

  // Handle keyboard input
  useInput((input, key) => {
    if (mode !== 'prompt') return;

    if (input === 'i' || input === 'I') {
      startImport();
    } else if (input === 'q' || input === 'Q' || key.escape) {
      exit();
    } else if (input === 's' || input === 'S') {
      onSkip();
    }
  });

  // After import completes, wait for keypress
  useInput((input, key) => {
    if (mode === 'complete' || mode === 'error') {
      if (key.return || input === ' ') {
        if (mode === 'complete') {
          onComplete();
        } else {
          onSkip();
        }
      }
    }
  });

  // Start the import process
  const startImport = async () => {
    setMode('importing');
    setStats({
      phase: 'detecting',
      current: 0,
      total: 0,
      inserted: 0,
      updated: 0,
    });

    try {
      const result = await runImport(db, {}, (progress: ImportProgress) => {
        setStats(s => ({
          ...s,
          phase: progress.phase,
          current: progress.current ?? s.current,
          total: progress.total ?? s.total,
        }));
      });

      setStats(s => ({
        ...s,
        phase: 'complete',
        inserted: result.totalInserted,
        updated: result.totalUpdated,
      }));

      if (result.success) {
        setMode('complete');
      } else {
        setError(result.errors.join('\n'));
        setMode('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMode('error');
    }
  };

  // Render progress bar
  const renderProgressBar = (current: number, total: number, width: number = 40) => {
    if (total === 0) return '░'.repeat(width);
    const filled = Math.floor((current / total) * width);
    const empty = width - filled;
    const percent = Math.floor((current / total) * 100);
    return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${percent}%`;
  };

  // Prompt mode - show welcome and detected files
  if (mode === 'prompt') {
    const available = historyFiles.filter(f => f.exists);
    const notFound = historyFiles.filter(f => !f.exists);

    return (
      <Box flexDirection="column">
        <Box borderStyle="single" paddingX={1}>
          <Text bold color="cyan">📖 GRIMOIRE - Welcome!</Text>
        </Box>

        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text>Your spell book is empty. Let's fill it with your command history!</Text>
          <Text> </Text>

          {available.length > 0 ? (
            <>
              <Text bold>Found history files:</Text>
              {available.map(file => (
                <Text key={file.path} color="green">
                  {'  '}✓ {file.path} ({formatFileSize(file.size)})
                </Text>
              ))}
              {notFound.map(file => (
                <Text key={file.path} dimColor>
                  {'  '}✗ {file.path} (not found)
                </Text>
              ))}
            </>
          ) : (
            <>
              <Text color="yellow">No history files found.</Text>
              <Text dimColor>Expected locations:</Text>
              {historyFiles.map(file => (
                <Text key={file.path} dimColor>
                  {'  '}{file.path}
                </Text>
              ))}
            </>
          )}

          <Text> </Text>

          {available.length > 0 ? (
            <>
              <Text>Press <Text bold color="cyan">[i]</Text> to import now, or <Text bold>[q]</Text> to quit.</Text>
              <Text dimColor>Press <Text dimColor>[s]</Text> to skip and start with empty database.</Text>
            </>
          ) : (
            <>
              <Text>Press <Text bold>[s]</Text> to continue with empty database.</Text>
              <Text dimColor>You can import later with: grimoire import</Text>
            </>
          )}

          <Text> </Text>
          <Text dimColor>You can also import manually: grimoire import</Text>
        </Box>

        <Box borderStyle="single" paddingX={1}>
          <Text dimColor>
            {available.length > 0 ? '[i] Import now   ' : ''}[s] Skip   [q] Quit
          </Text>
        </Box>
      </Box>
    );
  }

  // Importing mode - show progress
  if (mode === 'importing') {
    return (
      <Box flexDirection="column">
        <Box borderStyle="single" paddingX={1}>
          <Text bold color="cyan">📖 GRIMOIRE - Importing</Text>
        </Box>

        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text>
            {stats.phase === 'detecting' && 'Detecting history files...'}
            {stats.phase === 'parsing' && 'Parsing history files...'}
            {stats.phase === 'importing' && 'Importing commands...'}
          </Text>
          <Text> </Text>

          <Text color="cyan">{renderProgressBar(stats.current, stats.total)}</Text>
          <Text> </Text>

          {stats.total > 0 && (
            <Text dimColor>Processing: {stats.current} / {stats.total}</Text>
          )}
        </Box>

        <Box borderStyle="single" paddingX={1}>
          <Text dimColor>Please wait...</Text>
        </Box>
      </Box>
    );
  }

  // Complete mode - show results
  if (mode === 'complete') {
    return (
      <Box flexDirection="column">
        <Box borderStyle="single" paddingX={1}>
          <Text bold color="green">📖 GRIMOIRE - Import Complete!</Text>
        </Box>

        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text color="green">✓ Successfully imported your command history!</Text>
          <Text> </Text>
          <Text>
            {'  '}New commands: <Text bold color="cyan">{stats.inserted}</Text>
          </Text>
          <Text>
            {'  '}Updated: <Text dimColor>{stats.updated}</Text>
          </Text>
          <Text> </Text>
          <Text>Your spell book is ready. Start browsing, searching, and annotating!</Text>
          <Text> </Text>
          <Text dimColor>Press <Text>Enter</Text> to continue...</Text>
        </Box>

        <Box borderStyle="single" paddingX={1}>
          <Text dimColor>[Enter] Continue to Grimoire</Text>
        </Box>
      </Box>
    );
  }

  // Error mode
  if (mode === 'error') {
    return (
      <Box flexDirection="column">
        <Box borderStyle="single" paddingX={1}>
          <Text bold color="red">📖 GRIMOIRE - Import Error</Text>
        </Box>

        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text color="red">✗ Import encountered an error:</Text>
          <Text> </Text>
          <Text dimColor>{error}</Text>
          <Text> </Text>
          <Text>You can try again later with: grimoire import</Text>
          <Text> </Text>
          <Text dimColor>Press <Text>Enter</Text> to continue with empty database...</Text>
        </Box>

        <Box borderStyle="single" paddingX={1}>
          <Text dimColor>[Enter] Continue</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
