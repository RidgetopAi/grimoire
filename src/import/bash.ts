/**
 * Bash History Parser
 *
 * Parses ~/.bash_history files, handling:
 * - Simple one-command-per-line format
 * - HISTTIMEFORMAT timestamps (#TIMESTAMP on preceding line)
 * - Multi-line command continuations (backslash)
 * - Terminal escape sequences (mouse codes, ANSI escapes)
 * - Binary garbage and invalid commands
 */

import * as fs from 'fs';

export interface ParsedCommand {
  command: string;
  timestamp?: number;
  lineNumber: number;
}

export interface ParseResult {
  commands: ParsedCommand[];
  totalLines: number;
  skippedLines: number;
  errors: string[];
}

/**
 * Parse a bash history file
 *
 * @param filePath - Path to the bash history file
 * @returns ParseResult with commands and statistics
 */
export function parseBashHistory(filePath: string): ParseResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseBashHistoryContent(content);
}

/**
 * Parse bash history content string
 *
 * @param content - Raw history file content
 * @returns ParseResult with commands and statistics
 */
export function parseBashHistoryContent(content: string): ParseResult {
  const lines = content.split('\n');
  const commands: ParsedCommand[] = [];
  const errors: string[] = [];
  let skippedLines = 0;
  let pendingMultiline = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check for HISTTIMEFORMAT timestamp (format: #UNIX_TIMESTAMP)
    const timestampMatch = line.match(/^#(\d{10,})$/);
    if (timestampMatch && i + 1 < lines.length) {
      const nextLine = lines[++i];
      const command = cleanCommand(nextLine);
      if (isValidCommand(command)) {
        commands.push({
          command,
          timestamp: parseInt(timestampMatch[1], 10),
          lineNumber: i
        });
      } else {
        skippedLines++;
      }
      continue;
    }

    // Handle multi-line continuation (ends with backslash)
    if (line.endsWith('\\')) {
      pendingMultiline += line.slice(0, -1) + ' ';
      continue;
    }

    // Complete multi-line command
    if (pendingMultiline) {
      line = pendingMultiline + line;
      pendingMultiline = '';
    }

    const command = cleanCommand(line);
    if (isValidCommand(command)) {
      commands.push({ command, lineNumber: i });
    } else if (line.trim().length > 0) {
      skippedLines++;
    }
  }

  // Handle incomplete multi-line at end of file
  if (pendingMultiline) {
    const command = cleanCommand(pendingMultiline);
    if (isValidCommand(command)) {
      commands.push({ command, lineNumber: lines.length - 1 });
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
 * Clean a command string by removing escape sequences and normalizing whitespace
 */
export function cleanCommand(line: string): string {
  let cleaned = line;

  // Remove ANSI escape sequences (CSI sequences)
  // Format: ESC [ parameters letter
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  // Remove OSC (Operating System Command) sequences
  // Format: ESC ] ... BEL or ESC ] ... ESC \
  cleaned = cleaned.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '');

  // Remove mouse tracking escape codes that leaked into history
  // Format: digits;digits;digitsM (e.g., 35;7;1M)
  cleaned = cleaned.replace(/\d+;\d+;\d+M/g, '');

  // Remove other common escape sequences
  cleaned = cleaned.replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '');

  // Remove null bytes and other control characters (except tab and newline)
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // Normalize multiple spaces to single space
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Trim whitespace
  return cleaned.trim();
}

/**
 * Validate that a command string is worth storing
 */
export function isValidCommand(cmd: string): boolean {
  // Too short to be useful
  if (cmd.length < 2) return false;

  // Too long (likely binary garbage or encoded data)
  if (cmd.length > 10000) return false;

  // Check for binary garbage: high proportion of non-printable characters
  const nonPrintableCount = countNonPrintable(cmd);
  if (nonPrintableCount > cmd.length * 0.1) return false;

  // Skip lines that are only escape codes or garbage
  if (/^[\d;M\s]+$/.test(cmd)) return false;

  // Skip lines that look like binary data
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(cmd)) return false;

  return true;
}

/**
 * Count non-printable characters in a string
 */
function countNonPrintable(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Non-printable: control chars (0-31 except tab/newline) or DEL (127) or high bytes
    if ((code < 32 && code !== 9 && code !== 10) || code === 127 || code > 255) {
      count++;
    }
  }
  return count;
}
