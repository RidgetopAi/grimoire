/**
 * Tests for CommandStore service
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CommandStore } from '../src/services/CommandStore.js';
import { SCHEMA_SQL } from '../src/db/schema.js';

describe('CommandStore', () => {
  let db: Database.Database;
  let store: CommandStore;

  beforeEach(() => {
    // Create in-memory database for tests
    db = new Database(':memory:');
    db.exec(SCHEMA_SQL);
    store = new CommandStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsertCommand', () => {
    it('should insert a new command', () => {
      const result = store.upsertCommand({ command: 'ls -la' });
      expect(result).toBe('inserted');

      const cmd = store.getByCommand('ls -la');
      expect(cmd).not.toBeNull();
      expect(cmd?.command).toBe('ls -la');
      expect(cmd?.runCount).toBe(1);
    });

    it('should skip existing command without timestamp', () => {
      store.upsertCommand({ command: 'ls -la' });
      const result = store.upsertCommand({ command: 'ls -la' });
      // Without timestamp, we have no new info - skip
      expect(result).toBe('skipped');

      const cmd = store.getByCommand('ls -la');
      // run_count stays at 1 since we skipped
      expect(cmd?.runCount).toBe(1);
    });

    it('should update existing command with timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      store.upsertCommand({ command: 'ls -la', timestamp: now - 100 });
      const result = store.upsertCommand({ command: 'ls -la', timestamp: now });
      expect(result).toBe('updated');

      const cmd = store.getByCommand('ls -la');
      expect(cmd?.runCount).toBe(2);
      expect(cmd?.lastSeen).toBe(now);
    });

    it('should use provided timestamp', () => {
      const timestamp = 1704067200;
      store.upsertCommand({ command: 'ls -la', timestamp });

      const cmd = store.getByCommand('ls -la');
      expect(cmd?.firstSeen).toBe(timestamp);
      expect(cmd?.lastSeen).toBe(timestamp);
    });

    it('should track min first_seen and max last_seen', () => {
      store.upsertCommand({ command: 'ls -la', timestamp: 1000 });
      store.upsertCommand({ command: 'ls -la', timestamp: 500 });
      store.upsertCommand({ command: 'ls -la', timestamp: 2000 });

      const cmd = store.getByCommand('ls -la');
      expect(cmd?.firstSeen).toBe(500);
      expect(cmd?.lastSeen).toBe(2000);
    });
  });

  describe('importCommands', () => {
    it('should import multiple commands in a transaction', () => {
      const commands = [
        { command: 'ls -la' },
        { command: 'cd ~/projects' },
        { command: 'git status' },
      ];

      const result = store.importCommands(commands);
      expect(result.inserted).toBe(3);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(store.getCount()).toBe(3);
    });

    it('should deduplicate on import', () => {
      const commands = [
        { command: 'ls -la' },
        { command: 'ls -la' },
        { command: 'ls -la' },
      ];

      const result = store.importCommands(commands);
      expect(result.inserted).toBe(1);
      // Without timestamps, duplicates are skipped (no new info)
      expect(result.skipped).toBe(2);
      expect(store.getCount()).toBe(1);
    });

    it('should update timestamps when provided', () => {
      const now = Math.floor(Date.now() / 1000);
      const commands = [
        { command: 'git status', timestamp: now - 100 },
        { command: 'git status', timestamp: now - 50 },
        { command: 'git status', timestamp: now },
      ];

      const result = store.importCommands(commands);
      expect(result.inserted).toBe(1);
      expect(result.updated).toBe(2);
      expect(store.getCount()).toBe(1);

      // Verify last_seen was updated to newest timestamp
      const cmd = store.getByCommand('git status');
      expect(cmd?.lastSeen).toBe(now);
    });

    it('should handle empty import', () => {
      const result = store.importCommands([]);
      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(0);
    });
  });

  describe('getById', () => {
    it('should return command by ID', () => {
      store.upsertCommand({ command: 'ls -la' });
      const cmd = store.getByCommand('ls -la');
      expect(cmd).not.toBeNull();

      const byId = store.getById(cmd!.id);
      expect(byId).not.toBeNull();
      expect(byId?.command).toBe('ls -la');
    });

    it('should return null for non-existent ID', () => {
      const cmd = store.getById(9999);
      expect(cmd).toBeNull();
    });
  });

  describe('getRecent', () => {
    it('should return commands sorted by last_seen', () => {
      store.upsertCommand({ command: 'old', timestamp: 1000 });
      store.upsertCommand({ command: 'newest', timestamp: 3000 });
      store.upsertCommand({ command: 'middle', timestamp: 2000 });

      const recent = store.getRecent(10);
      expect(recent.length).toBe(3);
      expect(recent[0].command).toBe('newest');
      expect(recent[1].command).toBe('middle');
      expect(recent[2].command).toBe('old');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        store.upsertCommand({ command: `cmd-${i}` });
      }

      const recent = store.getRecent(5);
      expect(recent.length).toBe(5);
    });

    it('should respect offset parameter', () => {
      for (let i = 0; i < 10; i++) {
        store.upsertCommand({ command: `cmd-${i}`, timestamp: i * 100 });
      }

      const recent = store.getRecent(5, 3);
      expect(recent.length).toBe(5);
      // Should skip the 3 most recent
    });
  });

  describe('updateAnnotation', () => {
    it('should update annotation', () => {
      store.upsertCommand({ command: 'git push origin main' });
      const cmd = store.getByCommand('git push origin main');

      store.updateAnnotation(cmd!.id, 'Deploy to production');

      const updated = store.getById(cmd!.id);
      expect(updated?.annotation).toBe('Deploy to production');
    });

    it('should clear annotation when set to null', () => {
      store.upsertCommand({ command: 'git push origin main' });
      const cmd = store.getByCommand('git push origin main');

      store.updateAnnotation(cmd!.id, 'Some note');
      store.updateAnnotation(cmd!.id, null);

      const updated = store.getById(cmd!.id);
      expect(updated?.annotation).toBeNull();
    });

    it('should return false for non-existent command', () => {
      const result = store.updateAnnotation(9999, 'note');
      expect(result).toBe(false);
    });
  });

  describe('updateTags', () => {
    it('should update tags', () => {
      store.upsertCommand({ command: 'docker build .' });
      const cmd = store.getByCommand('docker build .');

      store.updateTags(cmd!.id, ['docker', 'build']);

      const updated = store.getById(cmd!.id);
      expect(updated?.tags).toEqual(['docker', 'build']);
    });

    it('should clear tags when set to empty array', () => {
      store.upsertCommand({ command: 'docker build .' });
      const cmd = store.getByCommand('docker build .');

      store.updateTags(cmd!.id, ['docker']);
      store.updateTags(cmd!.id, []);

      const updated = store.getById(cmd!.id);
      expect(updated?.tags).toBeNull();
    });
  });

  describe('toggleFavorite', () => {
    it('should toggle favorite status', () => {
      store.upsertCommand({ command: 'ls -la' });
      const cmd = store.getByCommand('ls -la');
      expect(cmd?.favorite).toBe(false);

      store.toggleFavorite(cmd!.id);
      const toggled = store.getById(cmd!.id);
      expect(toggled?.favorite).toBe(true);

      store.toggleFavorite(cmd!.id);
      const toggledAgain = store.getById(cmd!.id);
      expect(toggledAgain?.favorite).toBe(false);
    });
  });

  describe('setPrivate', () => {
    it('should set private status', () => {
      store.upsertCommand({ command: 'export API_KEY=secret' });
      const cmd = store.getByCommand('export API_KEY=secret');

      store.setPrivate(cmd!.id, true);
      const updated = store.getById(cmd!.id);
      expect(updated?.private).toBe(true);

      store.setPrivate(cmd!.id, false);
      const updatedAgain = store.getById(cmd!.id);
      expect(updatedAgain?.private).toBe(false);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      store.upsertCommand({ command: 'git status' });
      store.upsertCommand({ command: 'git push origin main' });
      store.upsertCommand({ command: 'git commit -m "fix bug"' });
      store.upsertCommand({ command: 'npm install' });
      store.upsertCommand({ command: 'docker build .' });
    });

    it('should search commands with FTS5', () => {
      const results = store.search('git');
      expect(results.length).toBe(3);
    });

    it('should search by partial match', () => {
      const results = store.search('push');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.command.includes('push'))).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = store.search('kubernetes');
      expect(results.length).toBe(0);
    });

    it('should respect limit parameter', () => {
      const results = store.search('git', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getByTag', () => {
    beforeEach(() => {
      store.upsertCommand({ command: 'git status' });
      const cmd = store.getByCommand('git status');
      store.updateTags(cmd!.id, ['git', 'vcs']);

      store.upsertCommand({ command: 'docker ps' });
      const dockerCmd = store.getByCommand('docker ps');
      store.updateTags(dockerCmd!.id, ['docker', 'container']);
    });

    it('should find commands by tag', () => {
      const results = store.getByTag('git');
      expect(results.length).toBe(1);
      expect(results[0].command).toBe('git status');
    });

    it('should return empty for non-existent tag', () => {
      const results = store.getByTag('kubernetes');
      expect(results.length).toBe(0);
    });
  });

  describe('getFavorites', () => {
    it('should return only favorited commands', () => {
      store.upsertCommand({ command: 'ls -la' });
      store.upsertCommand({ command: 'cd ~/projects' });
      store.upsertCommand({ command: 'git status' });

      const cmd = store.getByCommand('git status');
      store.toggleFavorite(cmd!.id);

      const favorites = store.getFavorites();
      expect(favorites.length).toBe(1);
      expect(favorites[0].command).toBe('git status');
    });
  });

  describe('delete', () => {
    it('should delete a command', () => {
      store.upsertCommand({ command: 'ls -la' });
      const cmd = store.getByCommand('ls -la');

      const result = store.delete(cmd!.id);
      expect(result).toBe(true);
      expect(store.getById(cmd!.id)).toBeNull();
    });

    it('should return false for non-existent command', () => {
      const result = store.delete(9999);
      expect(result).toBe(false);
    });
  });
});
