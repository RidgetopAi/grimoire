#!/usr/bin/env node
/**
 * Grimoire CLI Entry Point
 *
 * A spell book for shell commands - browse, search, and annotate your command history.
 */

import { Command } from 'commander';
import { getDatabasePath, ensureDirectories, isFirstRun, getHistoryPaths } from './services/Config.js';
import { getDatabase, closeDatabase, getCommandCount } from './db/index.js';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('grimoire')
  .description('A spell book for shell commands - browse, search, and annotate your command history')
  .version(VERSION, '-v, --version', 'Output the current version')
  .option('--debug', 'Enable debug output');

// Default command: launch TUI browser
program
  .action(async (options: { debug?: boolean }) => {
    if (options.debug) {
      console.log('Debug mode enabled');
      console.log(`Database path: ${getDatabasePath()}`);
      console.log(`First run: ${isFirstRun()}`);
      console.log(`History files:`, getHistoryPaths());
    }

    ensureDirectories();

    if (isFirstRun()) {
      console.log('📖 Welcome to Grimoire!');
      console.log();
      console.log('Your spell book is empty. Import your command history to get started:');
      console.log('  grimoire import');
      console.log();
      console.log('Or launch the interactive browser:');
      console.log('  grimoire browse');
      console.log();
      return;
    }

    // TODO: Launch TUI (Phase 3)
    const db = getDatabase(getDatabasePath());
    const count = getCommandCount(db);
    console.log(`📖 Grimoire - ${count} commands in your spell book`);
    console.log();
    console.log('TUI browser coming in Phase 3. For now, use:');
    console.log('  grimoire search <query>  - Search commands');
    console.log('  grimoire stats           - Show statistics');
    console.log('  grimoire --help          - Show all commands');
    closeDatabase();
  });

// Import command
program
  .command('import')
  .description('Import commands from shell history files')
  .option('--source <type>', 'Import only from specific shell (bash or zsh)')
  .option('--file <path>', 'Import from a specific file')
  .action(async (options: { source?: string; file?: string }) => {
    ensureDirectories();

    const historyPaths = getHistoryPaths();
    console.log('📖 Grimoire Import');
    console.log();

    if (options.file) {
      console.log(`Importing from: ${options.file}`);
      // TODO: Implement file import (Phase 2)
    } else if (options.source) {
      const sourcePath = historyPaths[options.source as 'bash' | 'zsh'];
      if (sourcePath) {
        console.log(`Importing from: ${sourcePath}`);
      } else {
        console.error(`No ${options.source} history file found`);
        process.exit(1);
      }
    } else {
      console.log('Found history files:');
      if (historyPaths.bash) {
        console.log(`  ✓ ${historyPaths.bash}`);
      }
      if (historyPaths.zsh) {
        console.log(`  ✓ ${historyPaths.zsh}`);
      }
      if (!historyPaths.bash && !historyPaths.zsh) {
        console.log('  ✗ No history files found');
        return;
      }
    }

    console.log();
    console.log('Import functionality coming in Phase 2.');
  });

// Search command
program
  .command('search <query>')
  .description('Search commands in your spell book')
  .option('-l, --limit <number>', 'Maximum results to show', '20')
  .option('--tag <tag>', 'Filter by tag')
  .option('--json', 'Output as JSON')
  .action(async (query: string, options: { limit: string; tag?: string; json?: boolean }) => {
    ensureDirectories();

    if (isFirstRun()) {
      console.error('No spell book found. Run "grimoire import" first.');
      process.exit(1);
    }

    console.log(`Searching for: "${query}"`);
    console.log(`Limit: ${options.limit}`);
    if (options.tag) {
      console.log(`Tag filter: ${options.tag}`);
    }
    console.log();
    console.log('Search functionality coming in Phase 3.');
  });

// Stats command
program
  .command('stats')
  .description('Show statistics about your spell book')
  .action(async () => {
    ensureDirectories();

    if (isFirstRun()) {
      console.log('📖 Grimoire Statistics');
      console.log('======================');
      console.log();
      console.log('Your spell book is empty.');
      console.log('Run "grimoire import" to get started.');
      return;
    }

    const db = getDatabase(getDatabasePath());
    const count = getCommandCount(db);

    console.log('📖 Grimoire Statistics');
    console.log('======================');
    console.log();
    console.log(`Total commands: ${count}`);
    console.log();
    console.log('Detailed statistics coming in Phase 5.');
    closeDatabase();
  });

// Export command
program
  .command('export')
  .description('Export commands for AI tools or backup')
  .option('--json', 'Export as JSON (default)')
  .option('--markdown', 'Export as Markdown')
  .option('--include-private', 'Include private commands (use with caution)')
  .action(async (options: { json?: boolean; markdown?: boolean; includePrivate?: boolean }) => {
    ensureDirectories();

    if (isFirstRun()) {
      console.error('No spell book found. Run "grimoire import" first.');
      process.exit(1);
    }

    const format = options.markdown ? 'markdown' : 'json';
    console.log(`Export format: ${format}`);
    if (options.includePrivate) {
      console.log('Warning: Including private commands');
    }
    console.log();
    console.log('Export functionality coming in Phase 5.');
  });

// Annotate command
program
  .command('annotate <id> <note>')
  .description('Add an annotation to a command')
  .option('--command <cmd>', 'Find command by text instead of ID')
  .action(async (id: string, note: string, options: { command?: string }) => {
    ensureDirectories();

    if (isFirstRun()) {
      console.error('No spell book found. Run "grimoire import" first.');
      process.exit(1);
    }

    if (options.command) {
      console.log(`Annotating command: "${options.command}"`);
    } else {
      console.log(`Annotating command ID: ${id}`);
    }
    console.log(`Note: "${note}"`);
    console.log();
    console.log('Annotation functionality coming in Phase 4.');
  });

// Tag command
program
  .command('tag <id> <tags...>')
  .description('Add tags to a command')
  .action(async (id: string, tags: string[]) => {
    ensureDirectories();

    if (isFirstRun()) {
      console.error('No spell book found. Run "grimoire import" first.');
      process.exit(1);
    }

    console.log(`Tagging command ID: ${id}`);
    console.log(`Tags: ${tags.join(', ')}`);
    console.log();
    console.log('Tagging functionality coming in Phase 4.');
  });

program.parse();
