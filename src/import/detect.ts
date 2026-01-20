/**
 * History File Detection
 *
 * Auto-detect available shell history files on the system.
 * Supports bash and zsh history file locations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type ShellType = 'bash' | 'zsh';

export interface HistoryFile {
  shell: ShellType;
  path: string;
  exists: boolean;
  size: number;
  modifiedAt: Date | null;
}

export interface DetectionResult {
  files: HistoryFile[];
  available: HistoryFile[];
  recommended: ShellType[];
}

/**
 * Standard history file locations
 */
const HISTORY_LOCATIONS: Record<ShellType, string[]> = {
  bash: [
    '.bash_history',
  ],
  zsh: [
    '.zsh_history',
    '.zhistory',
  ],
};

/**
 * Detect all available shell history files
 *
 * @returns DetectionResult with all found history files
 */
export function detectHistoryFiles(): DetectionResult {
  const home = os.homedir();
  const files: HistoryFile[] = [];
  const available: HistoryFile[] = [];
  const recommended: ShellType[] = [];

  for (const [shell, locations] of Object.entries(HISTORY_LOCATIONS) as [ShellType, string[]][]) {
    let foundForShell = false;

    for (const location of locations) {
      const fullPath = path.join(home, location);
      const historyFile = checkHistoryFile(shell, fullPath);
      files.push(historyFile);

      if (historyFile.exists && !foundForShell) {
        available.push(historyFile);
        foundForShell = true;
      }
    }

    if (foundForShell) {
      recommended.push(shell);
    }
  }

  return { files, available, recommended };
}

/**
 * Check a specific history file path
 */
function checkHistoryFile(shell: ShellType, filePath: string): HistoryFile {
  try {
    const stats = fs.statSync(filePath);
    return {
      shell,
      path: filePath,
      exists: true,
      size: stats.size,
      modifiedAt: stats.mtime,
    };
  } catch {
    return {
      shell,
      path: filePath,
      exists: false,
      size: 0,
      modifiedAt: null,
    };
  }
}

/**
 * Get the primary history file for a specific shell
 *
 * @param shell - Shell type to get history for
 * @returns Path to the history file, or null if not found
 */
export function getHistoryPath(shell: ShellType): string | null {
  const home = os.homedir();
  const locations = HISTORY_LOCATIONS[shell];

  for (const location of locations) {
    const fullPath = path.join(home, location);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Get all available history files as a simple map
 *
 * @returns Map of shell type to file path
 */
export function getAvailableHistories(): Map<ShellType, string> {
  const result = new Map<ShellType, string>();
  const detection = detectHistoryFiles();

  for (const file of detection.available) {
    result.set(file.shell, file.path);
  }

  return result;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(date: Date | null): string {
  if (!date) return 'unknown';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString();
}
