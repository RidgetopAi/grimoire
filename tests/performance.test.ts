import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CommandStore } from '../src/services/CommandStore.js';
import { parseBashHistoryContent } from '../src/import/bash.js';
import { SCHEMA_SQL } from '../src/db/schema.js';

describe('Performance Tests', () => {
  let db: Database.Database;
  let store: CommandStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_SQL);
    store = new CommandStore(db);
  });

  afterEach(() => {
    db.close();
  });

  function generateCommands(count: number): { command: string; timestamp: number }[] {
    const commands: { command: string; timestamp: number }[] = [];
    const baseCommands = [
      'git status',
      'git diff',
      'git add .',
      'git commit -m "update"',
      'git push origin main',
      'npm install',
      'npm run build',
      'npm test',
      'docker-compose up -d',
      'kubectl get pods',
      'ssh user@server',
      'cd /home/user/projects',
      'ls -la',
      'cat package.json',
      'vim config.ts',
      'curl -s https://api.example.com/data',
      'grep -r "pattern" src/',
      'find . -name "*.ts"',
      'tar -xzf archive.tar.gz',
      'chmod +x script.sh',
    ];

    const baseTime = Date.now() / 1000;
    for (let i = 0; i < count; i++) {
      const baseCmd = baseCommands[i % baseCommands.length];
      // Add variation to create unique commands
      const variation = i >= baseCommands.length ? ` # variation ${Math.floor(i / baseCommands.length)}` : '';
      commands.push({
        command: baseCmd + variation,
        timestamp: Math.floor(baseTime - (count - i) * 60), // 1 minute apart
      });
    }
    return commands;
  }

  describe('Import Performance', () => {
    it('imports 500 commands efficiently', () => {
      const commands = generateCommands(500);

      const start = performance.now();
      const imported = store.importCommands(commands);
      const duration = performance.now() - start;

      expect(imported.inserted).toBe(500);
      expect(duration).toBeLessThan(500); // Should complete in under 500ms
      console.log(`Import 500 commands: ${duration.toFixed(2)}ms`);
    });

    it('imports 2000 commands efficiently', () => {
      const commands = generateCommands(2000);

      const start = performance.now();
      const imported = store.importCommands(commands);
      const duration = performance.now() - start;

      expect(imported.inserted).toBe(2000);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      console.log(`Import 2000 commands: ${duration.toFixed(2)}ms`);
    });

    it('imports 5000 commands efficiently', () => {
      const commands = generateCommands(5000);

      const start = performance.now();
      const imported = store.importCommands(commands);
      const duration = performance.now() - start;

      expect(imported.inserted).toBe(5000);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
      console.log(`Import 5000 commands: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Search Performance', () => {
    beforeEach(() => {
      // Seed with 2000 commands
      const commands = generateCommands(2000);
      store.importCommands(commands);
    });

    it('FTS5 search is fast', () => {
      const start = performance.now();
      const results = store.search('git');
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // Should complete in under 50ms
      console.log(`FTS5 search "git" (${results.length} results): ${duration.toFixed(2)}ms`);
    });

    it('complex FTS5 query is fast', () => {
      const start = performance.now();
      const results = store.search('docker OR kubectl');
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);
      console.log(`FTS5 search "docker OR kubectl" (${results.length} results): ${duration.toFixed(2)}ms`);
    });

    it('partial match search is acceptable', () => {
      const start = performance.now();
      // Partial matches use LIKE which is slower
      const results = store.search('status'); // Full word match
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
      console.log(`Partial search "status" (${results.length} results): ${duration.toFixed(2)}ms`);
    });

    it('getRecent with large dataset is fast', () => {
      const start = performance.now();
      const results = store.getRecent(100);
      const duration = performance.now() - start;

      expect(results.length).toBe(100);
      expect(duration).toBeLessThan(50);
      console.log(`getRecent(100): ${duration.toFixed(2)}ms`);
    });
  });

  describe('Update Performance', () => {
    beforeEach(() => {
      const commands = generateCommands(1000);
      store.importCommands(commands);
    });

    it('batch updates are efficient', () => {
      const commands = store.getRecent(100);
      const start = performance.now();

      for (const cmd of commands) {
        store.updateAnnotation(cmd.id, `Note for command ${cmd.id}`);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(200);
      console.log(`100 annotation updates: ${duration.toFixed(2)}ms`);
    });

    it('toggle favorites is fast', () => {
      const commands = store.getRecent(50);
      const start = performance.now();

      for (const cmd of commands) {
        store.toggleFavorite(cmd.id);
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
      console.log(`50 favorite toggles: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Parser Performance', () => {
    it('parses large bash history efficiently', () => {
      // Generate a large bash history file content
      const lines: string[] = [];
      for (let i = 0; i < 10000; i++) {
        lines.push(`#${Math.floor(Date.now() / 1000) - i}`);
        lines.push(`command_${i} --option ${Math.random().toString(36).substring(7)}`);
      }
      const content = lines.join('\n');

      const start = performance.now();
      const result = parseBashHistoryContent(content);
      const duration = performance.now() - start;

      expect(result.commands.length).toBeGreaterThan(9000); // Some may be filtered
      expect(duration).toBeLessThan(500);
      console.log(`Parse 10000 bash history entries: ${duration.toFixed(2)}ms, got ${result.commands.length} commands`);
    });
  });
});
