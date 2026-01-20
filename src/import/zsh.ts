/**
 * Zsh History Parser
 *
 * Parses zsh history files in extended format:
 * : TIMESTAMP:ELAPSED;COMMAND
 *
 * Where:
 * - TIMESTAMP: Unix epoch when command was executed
 * - ELAPSED: Duration of command execution (often 0)
 * - COMMAND: The actual command text
 *
 * Also handles:
 * - Simple format (one command per line, no timestamps)
 * - Multi-line commands with backslash continuation
 */

import * as fs from 'fs';
import { cleanCommand, isValidCommand, ParsedCommand, ParseResult } from './bash.js';

/**
 * Parse a zsh history file
 *
 * @param filePath - Path to the zsh history file
 * @returns ParseResult with commands and statistics
 */
export function parseZshHistory(filePath: string): ParseResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseZshHistoryContent(content);
}

/**
 * Parse zsh history content string
 *
 * @param content - Raw history file content
 * @returns ParseResult with commands and statistics
 */
export function parseZshHistoryContent(content: string): ParseResult {
  const lines = content.split('\n');
  const commands: ParsedCommand[] = [];
  const errors: string[] = [];
  let skippedLines = 0;
  let pendingMultiline = '';
  let pendingTimestamp: number | undefined;

  // Extended history format regex: : TIMESTAMP:ELAPSED;COMMAND
  const extendedFormatRegex = /^: (\d+):(\d+);(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Try to match extended format
    const match = line.match(extendedFormatRegex);

    if (match) {
      const timestamp = parseInt(match[1], 10);
      let commandText = match[3];

      // Handle multi-line continuation in extended format
      // Zsh uses backslash at end of line for continuation
      if (commandText.endsWith('\\')) {
        pendingMultiline = commandText.slice(0, -1) + '\n';
        pendingTimestamp = timestamp;
        continue;
      }

      // Complete any pending multi-line command
      if (pendingMultiline) {
        commandText = pendingMultiline + commandText;
        pendingMultiline = '';
        // Use the original timestamp from start of multi-line
        if (pendingTimestamp !== undefined) {
          const cleaned = cleanCommand(commandText);
          if (isValidCommand(cleaned)) {
            commands.push({
              command: cleaned,
              timestamp: pendingTimestamp,
              lineNumber: i
            });
          } else {
            skippedLines++;
          }
          pendingTimestamp = undefined;
          continue;
        }
      }

      const cleaned = cleanCommand(commandText);
      if (isValidCommand(cleaned)) {
        commands.push({
          command: cleaned,
          timestamp,
          lineNumber: i
        });
      } else if (line.trim().length > 0) {
        skippedLines++;
      }
    } else {
      // Simple format (no timestamp) - similar to bash

      // Handle continuation of multi-line from extended format
      if (pendingMultiline) {
        if (line.endsWith('\\')) {
          pendingMultiline += line.slice(0, -1) + '\n';
          continue;
        } else {
          pendingMultiline += line;
          const cleaned = cleanCommand(pendingMultiline);
          if (isValidCommand(cleaned)) {
            commands.push({
              command: cleaned,
              timestamp: pendingTimestamp,
              lineNumber: i
            });
          } else {
            skippedLines++;
          }
          pendingMultiline = '';
          pendingTimestamp = undefined;
          continue;
        }
      }

      // Handle backslash continuation in simple format
      if (line.endsWith('\\')) {
        pendingMultiline = line.slice(0, -1) + '\n';
        continue;
      }

      const cleaned = cleanCommand(line);
      if (isValidCommand(cleaned)) {
        commands.push({ command: cleaned, lineNumber: i });
      } else if (line.trim().length > 0) {
        skippedLines++;
      }
    }
  }

  // Handle incomplete multi-line at end of file
  if (pendingMultiline) {
    const cleaned = cleanCommand(pendingMultiline);
    if (isValidCommand(cleaned)) {
      commands.push({
        command: cleaned,
        timestamp: pendingTimestamp,
        lineNumber: lines.length - 1
      });
    }
  }

  return {
    commands,
    totalLines: lines.length,
    skippedLines,
    errors
  };
}

/**
 * Detect if a file is in zsh extended format
 *
 * @param content - File content to check
 * @returns true if extended format is detected
 */
export function isExtendedFormat(content: string): boolean {
  // Check first few non-empty lines for extended format pattern
  const lines = content.split('\n').slice(0, 20);
  const extendedFormatRegex = /^: \d+:\d+;/;

  let matchCount = 0;
  for (const line of lines) {
    if (line.trim() && extendedFormatRegex.test(line)) {
      matchCount++;
    }
  }

  // If more than half the lines match, it's extended format
  return matchCount > lines.filter(l => l.trim()).length / 2;
}
