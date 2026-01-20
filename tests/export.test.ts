/**
 * Tests for export functions
 */
import { describe, it, expect } from 'vitest';
import { redactSecrets, hasSecrets, detectSecretTypes } from '../src/export/redact.js';
import { exportJson, exportJsonString } from '../src/export/json.js';
import { exportMarkdown, exportMarkdownSummary } from '../src/export/markdown.js';
import type { Command } from '../src/services/CommandStore.js';

// Helper to create a mock Command
function createCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: 1,
    command: 'ls -la',
    annotation: null,
    tags: null,
    firstSeen: 1704067200,
    lastSeen: 1704067200,
    runCount: 1,
    favorite: false,
    private: false,
    createdAt: 1704067200,
    updatedAt: 1704067200,
    ...overrides,
  };
}

describe('Secret Redaction', () => {
  describe('hasSecrets', () => {
    it('should detect API keys', () => {
      expect(hasSecrets('curl -H "api_key=abc123def456ghi789jkl012mno345"')).toBe(true);
      expect(hasSecrets('API_KEY=mysecretkey12345678901234567890')).toBe(true);
    });

    it('should detect Bearer tokens', () => {
      expect(hasSecrets('curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"')).toBe(true);
    });

    it('should detect passwords', () => {
      expect(hasSecrets('mysql -p secretpassword')).toBe(true);
      expect(hasSecrets('--password=mypassword123')).toBe(true);
      expect(hasSecrets('PASSWORD=secret123')).toBe(true);
    });

    it('should detect database URLs with credentials', () => {
      expect(hasSecrets('postgres://user:password@localhost/db')).toBe(true);
      expect(hasSecrets('mongodb://admin:secret@mongo.example.com/test')).toBe(true);
    });

    it('should detect GitHub tokens', () => {
      expect(hasSecrets('GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
    });

    it('should detect AWS keys', () => {
      expect(hasSecrets('export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')).toBe(true);
    });

    it('should detect curl with auth', () => {
      expect(hasSecrets('curl -u username:password https://api.example.com')).toBe(true);
    });

    it('should detect Base64 credentials', () => {
      expect(hasSecrets('Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=')).toBe(true);
    });

    it('should not flag safe commands', () => {
      expect(hasSecrets('ls -la')).toBe(false);
      expect(hasSecrets('git status')).toBe(false);
      expect(hasSecrets('npm install')).toBe(false);
      expect(hasSecrets('cd ~/projects')).toBe(false);
    });
  });

  describe('detectSecretTypes', () => {
    it('should identify specific secret types', () => {
      const types = detectSecretTypes('curl -u admin:secret123 https://api.example.com');
      expect(types).toContain('Curl Auth');
    });

    it('should detect multiple secret types', () => {
      const types = detectSecretTypes('API_KEY=secret123 PASSWORD=hunter2');
      expect(types.length).toBeGreaterThan(0);
    });

    it('should return empty array for safe commands', () => {
      const types = detectSecretTypes('git commit -m "fix bug"');
      expect(types.length).toBe(0);
    });
  });

  describe('redactSecrets', () => {
    it('should redact passwords', () => {
      const result = redactSecrets('mysql -p secretpassword');
      expect(result.redacted).not.toContain('secretpassword');
      expect(result.hadSecrets).toBe(true);
    });

    it('should redact Bearer tokens', () => {
      const result = redactSecrets('curl -H "Authorization: Bearer mytoken123"');
      expect(result.redacted).toContain('[REDACTED_TOKEN]');
      expect(result.hadSecrets).toBe(true);
    });

    it('should redact database URLs', () => {
      const result = redactSecrets('psql postgres://user:secret@localhost/db');
      expect(result.redacted).not.toContain('secret');
      expect(result.redacted).toContain('[REDACTED_CREDENTIALS]');
    });

    it('should not modify safe commands', () => {
      const result = redactSecrets('ls -la');
      expect(result.redacted).toBe('ls -la');
      expect(result.hadSecrets).toBe(false);
    });

    it('should preserve original in result', () => {
      const original = 'mysql -p secret';
      const result = redactSecrets(original);
      expect(result.original).toBe(original);
    });
  });
});

describe('JSON Export', () => {
  describe('exportJson', () => {
    it('should export commands with correct structure', () => {
      const commands = [
        createCommand({ id: 1, command: 'ls -la', runCount: 5 }),
        createCommand({ id: 2, command: 'git status', runCount: 10 }),
      ];

      const result = exportJson(commands);

      expect(result.version).toBe('1.0');
      expect(result.totalCommands).toBe(2);
      expect(result.commands.length).toBe(2);
      expect(result.exportedAt).toBeDefined();
      expect(result.statistics).toBeDefined();
    });

    it('should exclude private commands by default', () => {
      const commands = [
        createCommand({ id: 1, command: 'ls -la', private: false }),
        createCommand({ id: 2, command: 'export SECRET=abc', private: true }),
      ];

      const result = exportJson(commands);

      expect(result.totalCommands).toBe(1);
      expect(result.commands[0].command).toBe('ls -la');
    });

    it('should include private commands when option is set', () => {
      const commands = [
        createCommand({ id: 1, command: 'ls -la', private: false }),
        createCommand({ id: 2, command: 'export SECRET=abc', private: true }),
      ];

      const result = exportJson(commands, { includePrivate: true });

      expect(result.totalCommands).toBe(2);
    });

    it('should redact secrets by default', () => {
      const commands = [
        createCommand({ command: 'curl -u admin:password https://api.example.com' }),
      ];

      const result = exportJson(commands);

      expect(result.commands[0].command).toContain('[REDACTED');
    });

    it('should not redact when option is disabled', () => {
      const commands = [
        createCommand({ command: 'curl -u admin:password https://api.example.com' }),
      ];

      const result = exportJson(commands, { redactSecrets: false });

      expect(result.commands[0].command).toContain('password');
    });

    it('should convert timestamps to ISO 8601', () => {
      const commands = [
        createCommand({ firstSeen: 1704067200, lastSeen: 1704067200 }),
      ];

      const result = exportJson(commands);

      expect(result.commands[0].firstSeen).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.commands[0].lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should include tags as array', () => {
      const commands = [
        createCommand({ tags: ['git', 'vcs'] }),
      ];

      const result = exportJson(commands);

      expect(result.commands[0].tags).toEqual(['git', 'vcs']);
    });

    it('should calculate top tags statistics', () => {
      const commands = [
        createCommand({ id: 1, tags: ['git', 'vcs'] }),
        createCommand({ id: 2, tags: ['git', 'deploy'] }),
        createCommand({ id: 3, tags: ['docker'] }),
      ];

      const result = exportJson(commands);

      expect(result.statistics.topTags.length).toBeGreaterThan(0);
      expect(result.statistics.topTags[0].tag).toBe('git');
      expect(result.statistics.topTags[0].count).toBe(2);
    });

    it('should calculate most used statistics', () => {
      const commands = [
        createCommand({ id: 1, command: 'ls -la', runCount: 100 }),
        createCommand({ id: 2, command: 'git status', runCount: 50 }),
      ];

      const result = exportJson(commands);

      expect(result.statistics.mostUsed.length).toBeGreaterThan(0);
      expect(result.statistics.mostUsed[0].command).toBe('ls -la');
      expect(result.statistics.mostUsed[0].count).toBe(100);
    });

    it('should handle empty command list', () => {
      const result = exportJson([]);

      expect(result.totalCommands).toBe(0);
      expect(result.commands.length).toBe(0);
      expect(result.statistics.topTags.length).toBe(0);
      expect(result.statistics.mostUsed.length).toBe(0);
    });
  });

  describe('exportJsonString', () => {
    it('should return valid JSON string', () => {
      const commands = [createCommand()];
      const jsonStr = exportJsonString(commands);

      expect(() => JSON.parse(jsonStr)).not.toThrow();
    });

    it('should pretty print by default', () => {
      const commands = [createCommand()];
      const jsonStr = exportJsonString(commands);

      expect(jsonStr).toContain('\n');
    });

    it('should not pretty print when option is false', () => {
      const commands = [createCommand()];
      const jsonStr = exportJsonString(commands, {}, false);

      expect(jsonStr).not.toContain('\n  ');
    });
  });
});

describe('Markdown Export', () => {
  describe('exportMarkdown', () => {
    it('should include header with metadata', () => {
      const commands = [createCommand()];
      const result = exportMarkdown(commands);

      expect(result).toContain('# Command History Export');
      expect(result).toContain('Generated:');
      expect(result).toContain('Total Commands: 1');
    });

    it('should exclude private commands by default', () => {
      const commands = [
        createCommand({ id: 1, command: 'ls -la', private: false }),
        createCommand({ id: 2, command: 'secret command', private: true }),
      ];

      const result = exportMarkdown(commands);

      expect(result).toContain('ls -la');
      expect(result).not.toContain('secret command');
    });

    it('should group by category when option is enabled', () => {
      const commands = [
        createCommand({ command: 'git status' }),
        createCommand({ command: 'docker ps' }),
      ];

      const result = exportMarkdown(commands, { groupByCategory: true });

      expect(result).toContain('## Git Commands');
      expect(result).toContain('## Docker Commands');
    });

    it('should include annotation when present', () => {
      const commands = [
        createCommand({ command: 'git push', annotation: 'Deploy to production' }),
      ];

      const result = exportMarkdown(commands);

      expect(result).toContain('**Annotation**: Deploy to production');
    });

    it('should include tags when present', () => {
      const commands = [
        createCommand({ command: 'docker build', tags: ['docker', 'build'] }),
      ];

      const result = exportMarkdown(commands);

      expect(result).toContain('**Tags**: docker, build');
    });

    it('should show favorite status', () => {
      const commands = [
        createCommand({ command: 'git status', favorite: true }),
      ];

      const result = exportMarkdown(commands);

      expect(result).toContain('**Favorite**: Yes');
    });

    it('should redact secrets by default', () => {
      const commands = [
        createCommand({ command: 'curl -u admin:password https://api.com' }),
      ];

      const result = exportMarkdown(commands);

      expect(result).toContain('[REDACTED');
      expect(result).not.toContain('password');
    });

    it('should handle empty command list', () => {
      const result = exportMarkdown([]);

      expect(result).toContain('*No commands to export.*');
    });
  });

  describe('exportMarkdownSummary', () => {
    it('should create a table format', () => {
      const commands = [
        createCommand({ command: 'ls -la', annotation: 'List files' }),
      ];

      const result = exportMarkdownSummary(commands);

      expect(result).toContain('| Command | Annotation | Tags | Used |');
      expect(result).toContain('|---------|------------|------|------|');
      expect(result).toContain('`ls -la`');
    });

    it('should truncate long commands', () => {
      const longCommand = 'a'.repeat(100);
      const commands = [
        createCommand({ command: longCommand }),
      ];

      const result = exportMarkdownSummary(commands);

      expect(result).toContain('...');
      expect(result).not.toContain('a'.repeat(100));
    });

    it('should escape pipe characters in table', () => {
      const commands = [
        createCommand({ command: 'echo "a|b"', annotation: 'Test | annotation' }),
      ];

      const result = exportMarkdownSummary(commands);

      expect(result).toContain('\\|');
    });
  });
});
