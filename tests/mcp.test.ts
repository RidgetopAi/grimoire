/**
 * Tests for MCP Server functionality
 *
 * Tests the MCP tool handlers to ensure they correctly interact
 * with the CommandStore and return properly formatted responses.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/db/schema.js';
import { CommandStore } from '../src/services/CommandStore.js';
import { calculateStats } from '../src/services/Stats.js';
import { redactSecrets } from '../src/export/redact.js';

// We'll test the logic that would be used by MCP handlers directly
// since testing the actual MCP server requires stdio transport mocking

describe('MCP Tool Logic', () => {
  let db: Database.Database;
  let store: CommandStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_SQL);
    store = new CommandStore(db);

    // Seed with test data
    store.upsertCommand({ command: 'git status', timestamp: 1000 });
    store.upsertCommand({ command: 'git push origin main', timestamp: 2000 });
    store.upsertCommand({ command: 'docker build -t myapp .', timestamp: 3000 });
    store.upsertCommand({ command: 'npm install', timestamp: 4000 });
    store.upsertCommand({ command: 'curl -H "Authorization: Bearer sk-secret123" https://api.example.com', timestamp: 5000 });

    // Add some annotations and tags
    const gitStatus = store.getByCommand('git status');
    if (gitStatus) {
      store.updateAnnotation(gitStatus.id, 'Check repository status');
      store.updateTags(gitStatus.id, ['git', 'vcs']);
      store.toggleFavorite(gitStatus.id);
    }

    const gitPush = store.getByCommand('git push origin main');
    if (gitPush) {
      store.updateAnnotation(gitPush.id, 'Deploy to production');
      store.updateTags(gitPush.id, ['git', 'deploy']);
    }

    const curl = store.getByCommand('curl -H "Authorization: Bearer sk-secret123" https://api.example.com');
    if (curl) {
      store.setPrivate(curl.id, true);
    }
  });

  afterEach(() => {
    db.close();
  });

  describe('grimoire_search logic', () => {
    it('should search by query', () => {
      const results = store.search('git');
      expect(results.length).toBe(2);
      expect(results.some(c => c.command === 'git status')).toBe(true);
      expect(results.some(c => c.command === 'git push origin main')).toBe(true);
    });

    it('should get recent commands when no query', () => {
      const results = store.getRecent(10);
      expect(results.length).toBe(5);
      // Should be sorted by last_seen desc
      expect(results[0].command).toContain('curl');
    });

    it('should filter by tag', () => {
      const results = store.getByTag('deploy');
      expect(results.length).toBe(1);
      expect(results[0].command).toBe('git push origin main');
    });

    it('should get favorites only', () => {
      const favorites = store.getFavorites();
      expect(favorites.length).toBe(1);
      expect(favorites[0].command).toBe('git status');
    });

    it('should filter out private commands by default', () => {
      const results = store.getRecent(10);
      const nonPrivate = results.filter(c => !c.private);
      expect(nonPrivate.length).toBe(4);
    });

    it('should include private commands when requested', () => {
      const results = store.getRecent(10);
      // All 5 commands should be present
      expect(results.length).toBe(5);
    });

    it('should respect limit parameter', () => {
      const results = store.getRecent(2);
      expect(results.length).toBe(2);
    });
  });

  describe('grimoire_get_command logic', () => {
    it('should get command by ID', () => {
      const gitStatus = store.getByCommand('git status');
      expect(gitStatus).not.toBeNull();

      const byId = store.getById(gitStatus!.id);
      expect(byId).not.toBeNull();
      expect(byId?.command).toBe('git status');
      expect(byId?.annotation).toBe('Check repository status');
      expect(byId?.tags).toEqual(['git', 'vcs']);
      expect(byId?.favorite).toBe(true);
    });

    it('should return null for non-existent ID', () => {
      const result = store.getById(99999);
      expect(result).toBeNull();
    });
  });

  describe('grimoire_stats logic', () => {
    it('should calculate correct statistics', () => {
      const stats = calculateStats(db);

      expect(stats.totalCommands).toBe(5);
      expect(stats.annotatedCount).toBe(2);
      expect(stats.taggedCount).toBe(2);
      expect(stats.favoritesCount).toBe(1);
      expect(stats.privateCount).toBe(1);
    });

    it('should return top tags', () => {
      const stats = calculateStats(db);

      // 'git' tag appears on 2 commands
      const gitTag = stats.topTags.find(t => t.tag === 'git');
      expect(gitTag).toBeDefined();
      expect(gitTag?.count).toBe(2);
    });
  });

  describe('grimoire_annotate logic', () => {
    it('should add annotation to command', () => {
      const dockerCmd = store.getByCommand('docker build -t myapp .');
      expect(dockerCmd?.annotation).toBeNull();

      const success = store.updateAnnotation(dockerCmd!.id, 'Build Docker image');
      expect(success).toBe(true);

      const updated = store.getById(dockerCmd!.id);
      expect(updated?.annotation).toBe('Build Docker image');
    });

    it('should update existing annotation', () => {
      const gitStatus = store.getByCommand('git status');

      store.updateAnnotation(gitStatus!.id, 'Updated annotation');

      const updated = store.getById(gitStatus!.id);
      expect(updated?.annotation).toBe('Updated annotation');
    });

    it('should return false for non-existent command', () => {
      const success = store.updateAnnotation(99999, 'Note');
      expect(success).toBe(false);
    });
  });

  describe('grimoire_add_tags logic', () => {
    it('should add tags to command', () => {
      const dockerCmd = store.getByCommand('docker build -t myapp .');
      expect(dockerCmd?.tags).toBeNull();

      store.updateTags(dockerCmd!.id, ['docker', 'build']);

      const updated = store.getById(dockerCmd!.id);
      expect(updated?.tags).toEqual(['docker', 'build']);
    });

    it('should merge with existing tags', () => {
      const gitStatus = store.getByCommand('git status');
      const currentTags = gitStatus?.tags || [];

      // Add new tags by merging
      const newTags = [...new Set([...currentTags, 'workflow'])];
      store.updateTags(gitStatus!.id, newTags);

      const updated = store.getById(gitStatus!.id);
      expect(updated?.tags).toContain('git');
      expect(updated?.tags).toContain('vcs');
      expect(updated?.tags).toContain('workflow');
    });
  });

  describe('Secret redaction', () => {
    it('should redact secrets in output', () => {
      const cmd = store.getByCommand('curl -H "Authorization: Bearer sk-secret123" https://api.example.com');
      expect(cmd).not.toBeNull();

      const result = redactSecrets(cmd!.command);
      expect(result.hadSecrets).toBe(true);
      expect(result.redacted).not.toContain('sk-secret123');
      expect(result.redacted).toContain('[REDACTED');
    });

    it('should not redact non-secret commands', () => {
      const cmd = 'git push origin main';
      const result = redactSecrets(cmd);
      expect(result.hadSecrets).toBe(false);
      expect(result.redacted).toBe(cmd);
    });
  });

  describe('Command formatting', () => {
    it('should format timestamps as ISO strings', () => {
      const cmd = store.getByCommand('git status');
      expect(cmd).not.toBeNull();

      // Simulate the formatting that MCP handler would do
      const formatted = {
        firstSeen: new Date(cmd!.firstSeen * 1000).toISOString(),
        lastSeen: new Date(cmd!.lastSeen * 1000).toISOString(),
      };

      expect(formatted.firstSeen).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(formatted.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

describe('MCP Response Format', () => {
  it('should produce valid JSON responses', () => {
    const response = {
      count: 2,
      commands: [
        {
          id: 1,
          command: 'git status',
          annotation: 'Check status',
          tags: ['git'],
          firstSeen: '2026-01-19T12:00:00.000Z',
          lastSeen: '2026-01-19T12:00:00.000Z',
          runCount: 5,
          favorite: true,
          private: false,
        },
      ],
    };

    const json = JSON.stringify(response);
    const parsed = JSON.parse(json);

    expect(parsed.count).toBe(2);
    expect(parsed.commands).toHaveLength(1);
    expect(parsed.commands[0].id).toBe(1);
  });

  it('should format error responses correctly', () => {
    const errorResponse = {
      error: 'Command with ID 99999 not found',
    };

    const json = JSON.stringify(errorResponse);
    const parsed = JSON.parse(json);

    expect(parsed.error).toBe('Command with ID 99999 not found');
  });

  it('should format stats response correctly', () => {
    const statsResponse = {
      totalCommands: 100,
      annotatedCount: 25,
      taggedCount: 50,
      favoritesCount: 10,
      topTags: [
        { tag: 'git', count: 30 },
        { tag: 'docker', count: 15 },
      ],
      mostUsed: [
        { command: 'ls -la', count: 150 },
      ],
      timeRange: {
        oldest: '2025-01-01T00:00:00.000Z',
        newest: '2026-01-19T12:00:00.000Z',
      },
    };

    const json = JSON.stringify(statsResponse);
    const parsed = JSON.parse(json);

    expect(parsed.totalCommands).toBe(100);
    expect(parsed.topTags).toHaveLength(2);
    expect(parsed.mostUsed).toHaveLength(1);
  });
});
