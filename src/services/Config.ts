/**
 * Configuration service for Grimoire
 *
 * Follows XDG Base Directory Specification for Linux/macOS compatibility.
 * - Data: $XDG_DATA_HOME/grimoire (default: ~/.local/share/grimoire)
 * - Config: $XDG_CONFIG_HOME/grimoire (default: ~/.config/grimoire)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface GrimoireConfig {
  database: string;
  import: {
    sources: ('bash' | 'zsh')[];
    maxCommandLength: number;
  };
  display: {
    commandTruncate: number;
    annotationTruncate: number;
    showTagsInList: boolean;
    dateFormat: 'relative' | 'absolute';
  };
  export: {
    excludePrivate: boolean;
    redactSecrets: boolean;
  };
}

const DEFAULT_CONFIG: GrimoireConfig = {
  database: '', // Will be set dynamically
  import: {
    sources: ['bash', 'zsh'],
    maxCommandLength: 10000,
  },
  display: {
    commandTruncate: 80,
    annotationTruncate: 120,
    showTagsInList: true,
    dateFormat: 'relative',
  },
  export: {
    excludePrivate: true,
    redactSecrets: true,
  },
};

/**
 * Get the XDG data directory for Grimoire
 *
 * Uses $XDG_DATA_HOME if set, otherwise defaults to ~/.local/share/grimoire
 */
export function getDataDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME ||
    path.join(os.homedir(), '.local', 'share');
  return path.join(xdgDataHome, 'grimoire');
}

/**
 * Get the XDG config directory for Grimoire
 *
 * Uses $XDG_CONFIG_HOME if set, otherwise defaults to ~/.config/grimoire
 */
export function getConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ||
    path.join(os.homedir(), '.config');
  return path.join(xdgConfigHome, 'grimoire');
}

/**
 * Get the path to the database file
 */
export function getDatabasePath(): string {
  return path.join(getDataDir(), 'grimoire.db');
}

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Ensure data and config directories exist
 */
export function ensureDirectories(): void {
  const dataDir = getDataDir();
  const configDir = getConfigDir();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Load configuration from file, with defaults
 */
export function loadConfig(): GrimoireConfig {
  const configPath = getConfigPath();
  const config = { ...DEFAULT_CONFIG, database: getDatabasePath() };

  if (fs.existsSync(configPath)) {
    try {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const fileConfig = JSON.parse(fileContent) as Partial<GrimoireConfig>;

      // Merge with defaults (shallow merge for simplicity in MVP)
      if (fileConfig.database) config.database = fileConfig.database;
      if (fileConfig.import) config.import = { ...config.import, ...fileConfig.import };
      if (fileConfig.display) config.display = { ...config.display, ...fileConfig.display };
      if (fileConfig.export) config.export = { ...config.export, ...fileConfig.export };
    } catch {
      // If config is invalid, use defaults
      console.error(`Warning: Could not parse config file: ${configPath}`);
    }
  }

  return config;
}

/**
 * Save configuration to file
 */
export function saveConfig(config: GrimoireConfig): void {
  ensureDirectories();
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get paths to shell history files that exist on this system
 */
export function getHistoryPaths(): { bash?: string; zsh?: string } {
  const home = os.homedir();
  const paths: { bash?: string; zsh?: string } = {};

  const bashPath = path.join(home, '.bash_history');
  if (fs.existsSync(bashPath)) {
    paths.bash = bashPath;
  }

  const zshPath = path.join(home, '.zsh_history');
  if (fs.existsSync(zshPath)) {
    paths.zsh = zshPath;
  }

  // Also check alternate zsh location
  const zshAltPath = path.join(home, '.zhistory');
  if (!paths.zsh && fs.existsSync(zshAltPath)) {
    paths.zsh = zshAltPath;
  }

  return paths;
}

/**
 * Check if this is a first run (no database exists)
 */
export function isFirstRun(): boolean {
  return !fs.existsSync(getDatabasePath());
}
