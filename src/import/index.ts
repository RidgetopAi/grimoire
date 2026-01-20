/**
 * Import Command Handler
 *
 * Orchestrates the import process from shell history files.
 * Supports auto-detection, source filtering, and progress reporting.
 */

import type Database from 'better-sqlite3';
import { parseBashHistory } from './bash.js';
import { parseZshHistory } from './zsh.js';
import {
  detectHistoryFiles,
  getHistoryPath,
  formatFileSize,
  formatRelativeTime,
  type ShellType,
  type HistoryFile,
} from './detect.js';
import { CommandStore, type ImportResult } from '../services/CommandStore.js';

export interface ImportOptions {
  source?: ShellType;
  file?: string;
  verbose?: boolean;
}

export interface ImportProgress {
  phase: 'detecting' | 'parsing' | 'importing' | 'complete';
  shell?: ShellType;
  file?: string;
  current?: number;
  total?: number;
  message: string;
}

export type ProgressCallback = (progress: ImportProgress) => void;

export interface FullImportResult {
  success: boolean;
  sources: Array<{
    shell: ShellType;
    file: string;
    parsed: number;
    imported: ImportResult;
  }>;
  totalParsed: number;
  totalInserted: number;
  totalUpdated: number;
  totalSkipped: number;
  errors: string[];
}

/**
 * Run the import process
 *
 * @param db - Database connection
 * @param options - Import options
 * @param onProgress - Progress callback
 * @returns Full import result
 */
export async function runImport(
  db: Database.Database,
  options: ImportOptions = {},
  onProgress?: ProgressCallback
): Promise<FullImportResult> {
  const result: FullImportResult = {
    success: true,
    sources: [],
    totalParsed: 0,
    totalInserted: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    errors: [],
  };

  const store = new CommandStore(db);
  const progress = (p: ImportProgress) => onProgress?.(p);

  // Phase 1: Detect available history files
  progress({ phase: 'detecting', message: 'Detecting history files...' });

  let filesToImport: Array<{ shell: ShellType; path: string }> = [];

  if (options.file) {
    // Import from specific file - try to detect shell type
    const shell = detectShellFromPath(options.file);
    filesToImport.push({ shell, path: options.file });
  } else if (options.source) {
    // Import from specific shell
    const historyPath = getHistoryPath(options.source);
    if (!historyPath) {
      result.success = false;
      result.errors.push(`No ${options.source} history file found`);
      return result;
    }
    filesToImport.push({ shell: options.source, path: historyPath });
  } else {
    // Auto-detect all available history files
    const detection = detectHistoryFiles();
    filesToImport = detection.available.map(f => ({ shell: f.shell, path: f.path }));

    if (filesToImport.length === 0) {
      result.success = false;
      result.errors.push('No shell history files found');
      return result;
    }
  }

  // Phase 2 & 3: Parse and import each file
  for (const { shell, path } of filesToImport) {
    progress({
      phase: 'parsing',
      shell,
      file: path,
      message: `Parsing ${shell} history from ${path}...`,
    });

    try {
      // Parse the history file
      const parseResult = shell === 'zsh'
        ? parseZshHistory(path)
        : parseBashHistory(path);

      result.totalParsed += parseResult.commands.length;

      progress({
        phase: 'importing',
        shell,
        file: path,
        total: parseResult.commands.length,
        current: 0,
        message: `Importing ${parseResult.commands.length} commands from ${shell}...`,
      });

      // Import commands to database
      const importInput = parseResult.commands.map(cmd => ({
        command: cmd.command,
        timestamp: cmd.timestamp,
      }));

      const importResult = store.importCommands(importInput);

      result.sources.push({
        shell,
        file: path,
        parsed: parseResult.commands.length,
        imported: importResult,
      });

      result.totalInserted += importResult.inserted;
      result.totalUpdated += importResult.updated;
      result.totalSkipped += importResult.skipped;
      result.errors.push(...importResult.errors);

      if (parseResult.errors.length > 0) {
        result.errors.push(...parseResult.errors);
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to import ${shell} history: ${error}`);
    }
  }

  progress({
    phase: 'complete',
    message: `Import complete: ${result.totalInserted} new, ${result.totalUpdated} updated`,
  });

  return result;
}

/**
 * Detect shell type from file path
 */
function detectShellFromPath(filePath: string): ShellType {
  const lower = filePath.toLowerCase();
  if (lower.includes('zsh')) return 'zsh';
  return 'bash';
}

/**
 * Get a summary of available history files for display
 */
export function getHistorySummary(): string[] {
  const detection = detectHistoryFiles();
  const lines: string[] = [];

  if (detection.available.length === 0) {
    lines.push('No shell history files found.');
    lines.push('');
    lines.push('Expected locations:');
    for (const file of detection.files) {
      lines.push(`  ${file.path}`);
    }
    return lines;
  }

  lines.push('Available history files:');
  lines.push('');

  for (const file of detection.available) {
    const size = formatFileSize(file.size);
    const modified = formatRelativeTime(file.modifiedAt);
    lines.push(`  ${file.shell}: ${file.path}`);
    lines.push(`       Size: ${size}, Modified: ${modified}`);
    lines.push('');
  }

  return lines;
}

// Re-export types and utilities
export { detectHistoryFiles, getHistoryPath, formatFileSize, formatRelativeTime };
export type { ShellType, HistoryFile };
