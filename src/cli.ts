#!/usr/bin/env node
/**
 * Grimoire CLI Entry Point
 *
 * A spell book for shell commands - browse, search, and annotate your command history.
 */

import { Command } from 'commander';
import { getDatabasePath, ensureDirectories, isFirstRun, getHistoryPaths } from './services/Config.js';
import { getDatabase, closeDatabase, getCommandCount } from './db/index.js';
import { runImport, getHistorySummary, type ShellType } from './import/index.js';

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
  .option('--dry-run', 'Show what would be imported without making changes')
  .action(async (options: { source?: string; file?: string; dryRun?: boolean }) => {
    ensureDirectories();

    console.log('📖 Grimoire Import');
    console.log();

    // Show available history files
    const summary = getHistorySummary();
    for (const line of summary) {
      console.log(line);
    }

    if (options.dryRun) {
      console.log('Dry run mode - no changes will be made.');
      console.log();
    }

    // Validate source option
    if (options.source && !['bash', 'zsh'].includes(options.source)) {
      console.error(`Invalid source: ${options.source}. Must be 'bash' or 'zsh'.`);
      process.exit(1);
    }

    // Run the import
    const db = getDatabase(getDatabasePath());

    try {
      const result = await runImport(
        db,
        {
          source: options.source as ShellType | undefined,
          file: options.file,
          verbose: true,
        },
        (progress) => {
          if (progress.phase === 'parsing') {
            console.log(`Parsing ${progress.shell} history...`);
          } else if (progress.phase === 'importing') {
            console.log(`Importing ${progress.total} commands...`);
          }
        }
      );

      console.log();
      console.log('Import Results');
      console.log('==============');
      console.log();

      for (const source of result.sources) {
        console.log(`${source.shell}: ${source.file}`);
        console.log(`  Parsed:   ${source.parsed} commands`);
        console.log(`  New:      ${source.imported.inserted}`);
        console.log(`  Updated:  ${source.imported.updated}`);
        if (source.imported.skipped > 0) {
          console.log(`  Skipped:  ${source.imported.skipped}`);
        }
        console.log();
      }

      console.log('Total');
      console.log('-----');
      console.log(`  Parsed:   ${result.totalParsed}`);
      console.log(`  New:      ${result.totalInserted}`);
      console.log(`  Updated:  ${result.totalUpdated}`);

      if (result.errors.length > 0) {
        console.log();
        console.log('Errors:');
        for (const error of result.errors.slice(0, 5)) {
          console.log(`  - ${error}`);
        }
        if (result.errors.length > 5) {
          console.log(`  ... and ${result.errors.length - 5} more errors`);
        }
      }

      const totalCommands = getCommandCount(db);
      console.log();
      console.log(`Your spell book now contains ${totalCommands} commands.`);

    } catch (error) {
      console.error('Import failed:', error);
      process.exit(1);
    } finally {
      closeDatabase();
    }
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
