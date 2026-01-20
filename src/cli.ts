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
import { runExport, type ExportFormat } from './export/index.js';
import { calculateStats, formatStats } from './services/Stats.js';
import { CommandStore } from './services/CommandStore.js';
import { launchTUI } from './index.js';

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

    // Launch TUI - Welcome screen handles first-run experience
    launchTUI();
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

    const db = getDatabase(getDatabasePath());

    try {
      const store = new CommandStore(db);
      const limit = parseInt(options.limit, 10);

      let results;
      if (options.tag) {
        // Filter by tag
        results = store.getByTag(options.tag, limit);
        // Then filter by query if provided
        if (query && query !== '*') {
          results = results.filter(cmd =>
            cmd.command.toLowerCase().includes(query.toLowerCase()) ||
            (cmd.annotation && cmd.annotation.toLowerCase().includes(query.toLowerCase()))
          );
        }
      } else {
        // Full-text search
        results = store.search(query, limit);
      }

      if (options.json) {
        // JSON output
        const output = results.map(cmd => ({
          id: cmd.id,
          command: cmd.command,
          annotation: cmd.annotation,
          tags: cmd.tags,
          runCount: cmd.runCount,
          lastSeen: new Date(cmd.lastSeen * 1000).toISOString(),
          favorite: cmd.favorite,
        }));
        console.log(JSON.stringify(output, null, 2));
      } else {
        // Human-readable output
        if (results.length === 0) {
          console.log('No commands found matching your query.');
        } else {
          console.log(`Found ${results.length} command${results.length === 1 ? '' : 's'}:\n`);
          for (const cmd of results) {
            const truncated = cmd.command.length > 70
              ? cmd.command.slice(0, 67) + '...'
              : cmd.command;
            const tags = cmd.tags && cmd.tags.length > 0
              ? ` [${cmd.tags.join(', ')}]`
              : '';
            const fav = cmd.favorite ? ' *' : '';

            console.log(`  ${cmd.id}. ${truncated}${tags}${fav}`);
            if (cmd.annotation) {
              console.log(`      ${cmd.annotation}`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Stats command
program
  .command('stats')
  .description('Show statistics about your spell book')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    ensureDirectories();

    if (isFirstRun()) {
      console.log('Grimoire Statistics');
      console.log('==================');
      console.log();
      console.log('Your spell book is empty.');
      console.log('Run "grimoire import" to get started.');
      return;
    }

    const db = getDatabase(getDatabasePath());

    try {
      const stats = calculateStats(db);

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log(formatStats(stats));
      }
    } catch (error) {
      console.error('Failed to calculate statistics:', error);
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// Export command
program
  .command('export')
  .description('Export commands for AI tools or backup')
  .option('--json', 'Export as JSON (default)')
  .option('--markdown', 'Export as Markdown')
  .option('--include-private', 'Include private commands (use with caution)')
  .option('--no-redact', 'Disable secret redaction (use with caution)')
  .action(async (options: { json?: boolean; markdown?: boolean; includePrivate?: boolean; redact?: boolean }) => {
    ensureDirectories();

    if (isFirstRun()) {
      console.error('No spell book found. Run "grimoire import" first.');
      process.exit(1);
    }

    const db = getDatabase(getDatabasePath());

    try {
      const format: ExportFormat = options.markdown ? 'markdown' : 'json';

      // Warn about dangerous options (to stderr so it doesn't pollute output)
      if (options.includePrivate) {
        console.error('Warning: Including private commands in export');
      }
      if (options.redact === false) {
        console.error('Warning: Secret redaction is disabled');
      }

      const output = runExport(db, {
        format,
        includePrivate: options.includePrivate ?? false,
        redactSecrets: options.redact !== false,
      });

      console.log(output);
    } catch (error) {
      console.error('Export failed:', error);
      process.exit(1);
    } finally {
      closeDatabase();
    }
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

    const db = getDatabase(getDatabasePath());

    try {
      const store = new CommandStore(db);
      let command;

      if (options.command) {
        command = store.getByCommand(options.command);
        if (!command) {
          console.error(`Command not found: "${options.command}"`);
          process.exit(1);
        }
      } else {
        const commandId = parseInt(id, 10);
        if (isNaN(commandId)) {
          console.error(`Invalid ID: ${id}`);
          process.exit(1);
        }
        command = store.getById(commandId);
        if (!command) {
          console.error(`Command not found with ID: ${id}`);
          process.exit(1);
        }
      }

      store.updateAnnotation(command.id, note);
      console.log(`Annotated command #${command.id}:`);
      console.log(`  Command: ${command.command.slice(0, 60)}${command.command.length > 60 ? '...' : ''}`);
      console.log(`  Note: ${note}`);
    } catch (error) {
      console.error('Annotation failed:', error);
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

// MCP command - run as MCP server
program
  .command('mcp')
  .description('Run as a Model Context Protocol (MCP) server for AI assistants')
  .action(async () => {
    const { runMcpServer } = await import('./mcp/index.js');
    await runMcpServer();
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

    const commandId = parseInt(id, 10);
    if (isNaN(commandId)) {
      console.error(`Invalid ID: ${id}`);
      process.exit(1);
    }

    const db = getDatabase(getDatabasePath());

    try {
      const store = new CommandStore(db);
      const command = store.getById(commandId);

      if (!command) {
        console.error(`Command not found with ID: ${id}`);
        process.exit(1);
      }

      // Merge with existing tags
      const existingTags = command.tags ?? [];
      const newTags = [...new Set([...existingTags, ...tags])];

      store.updateTags(command.id, newTags);
      console.log(`Tagged command #${command.id}:`);
      console.log(`  Command: ${command.command.slice(0, 60)}${command.command.length > 60 ? '...' : ''}`);
      console.log(`  Tags: ${newTags.join(', ')}`);
    } catch (error) {
      console.error('Tagging failed:', error);
      process.exit(1);
    } finally {
      closeDatabase();
    }
  });

program.parse();
