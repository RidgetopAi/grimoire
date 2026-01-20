#!/usr/bin/env node
/**
 * Grimoire TUI Entry Point
 *
 * This file renders the Ink-based TUI application.
 * Called from cli.ts when launching the interactive browser.
 */

import { render } from 'ink';
import { App } from './ui/App.js';
import { getDatabase, closeDatabase } from './db/index.js';
import { getDatabasePath, ensureDirectories } from './services/Config.js';

/**
 * Launch the TUI application
 */
export function launchTUI(): void {
  ensureDirectories();
  const dbPath = getDatabasePath();
  const db = getDatabase(dbPath);

  const { waitUntilExit } = render(<App db={db} />);

  waitUntilExit().then(() => {
    closeDatabase();
  });
}

// If run directly (for testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  launchTUI();
}
