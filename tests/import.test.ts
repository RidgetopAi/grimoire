/**
 * Tests for history import parsers
 */
import { describe, it, expect } from 'vitest';
import { parseBashHistoryContent, cleanCommand, isValidCommand } from '../src/import/bash.js';
import { parseZshHistoryContent, isExtendedFormat } from '../src/import/zsh.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Bash History Parser', () => {
  describe('parseBashHistoryContent', () => {
    it('should parse simple one-command-per-line format', () => {
      const content = fs.readFileSync(
        path.join(__dirname, 'fixtures/bash_history_simple.txt'),
        'utf-8'
      );
      const result = parseBashHistoryContent(content);

      expect(result.commands.length).toBe(10);
      expect(result.commands[0].command).toBe('ls -la');
      expect(result.commands[1].command).toBe('cd ~/projects');
      expect(result.commands[9].command).toBe('kubectl get pods');
    });

    it('should parse HISTTIMEFORMAT timestamps', () => {
      const content = fs.readFileSync(
        path.join(__dirname, 'fixtures/bash_history_timestamps.txt'),
        'utf-8'
      );
      const result = parseBashHistoryContent(content);

      expect(result.commands.length).toBe(5);
      expect(result.commands[0].command).toBe('ls -la');
      expect(result.commands[0].timestamp).toBe(1704067200);
      expect(result.commands[1].timestamp).toBe(1704067260);
    });

    it('should handle multi-line commands with backslash continuation', () => {
      const content = fs.readFileSync(
        path.join(__dirname, 'fixtures/bash_history_multiline.txt'),
        'utf-8'
      );
      const result = parseBashHistoryContent(content);

      // Should combine multi-line commands
      const dockerCmd = result.commands.find(c => c.command.includes('docker run'));
      expect(dockerCmd).toBeDefined();
      expect(dockerCmd?.command).toContain('--name mycontainer');
      expect(dockerCmd?.command).toContain('ubuntu:latest');
    });

    it('should skip corrupted/garbage lines', () => {
      const content = fs.readFileSync(
        path.join(__dirname, 'fixtures/bash_history_corrupted.txt'),
        'utf-8'
      );
      const result = parseBashHistoryContent(content);

      // Should skip garbage lines like "35;7;1M35;7;1M" and single char "a"
      expect(result.skippedLines).toBeGreaterThan(0);
      expect(result.commands.find(c => c.command.includes('35;7;1M'))).toBeUndefined();
    });

    it('should handle empty content', () => {
      const result = parseBashHistoryContent('');
      expect(result.commands.length).toBe(0);
      expect(result.totalLines).toBe(1); // Empty string splits to ['']
    });

    it('should handle content with only whitespace lines', () => {
      const result = parseBashHistoryContent('   \n\t\n  \n');
      expect(result.commands.length).toBe(0);
    });
  });

  describe('cleanCommand', () => {
    it('should remove ANSI escape sequences', () => {
      const dirty = '\x1b[31mls -la\x1b[0m';
      expect(cleanCommand(dirty)).toBe('ls -la');
    });

    it('should remove mouse tracking codes', () => {
      const dirty = '35;7;1Mls -la35;8;2M';
      expect(cleanCommand(dirty)).toBe('ls -la');
    });

    it('should normalize multiple spaces', () => {
      const dirty = 'ls    -la     /tmp';
      expect(cleanCommand(dirty)).toBe('ls -la /tmp');
    });

    it('should trim whitespace', () => {
      const dirty = '   ls -la   ';
      expect(cleanCommand(dirty)).toBe('ls -la');
    });

    it('should remove null bytes and control characters', () => {
      const dirty = 'ls\x00 -la\x1f';
      expect(cleanCommand(dirty)).toBe('ls -la');
    });
  });

  describe('isValidCommand', () => {
    it('should accept normal commands', () => {
      expect(isValidCommand('ls -la')).toBe(true);
      expect(isValidCommand('git commit -m "message"')).toBe(true);
      expect(isValidCommand('npm install')).toBe(true);
    });

    it('should reject too short commands', () => {
      expect(isValidCommand('a')).toBe(false);
      expect(isValidCommand('')).toBe(false);
    });

    it('should reject garbage patterns', () => {
      expect(isValidCommand('35;7;1M')).toBe(false);
      expect(isValidCommand('123;456;789M')).toBe(false);
    });

    it('should accept 2-character commands', () => {
      expect(isValidCommand('ls')).toBe(true);
      expect(isValidCommand('cd')).toBe(true);
    });
  });
});

describe('Zsh History Parser', () => {
  describe('parseZshHistoryContent', () => {
    it('should parse extended format with timestamps', () => {
      const content = fs.readFileSync(
        path.join(__dirname, 'fixtures/zsh_history_extended.txt'),
        'utf-8'
      );
      const result = parseZshHistoryContent(content);

      expect(result.commands.length).toBe(5);
      expect(result.commands[0].command).toBe('ls -la');
      expect(result.commands[0].timestamp).toBe(1704067200);
    });

    it('should parse simple format (same as bash)', () => {
      const content = 'ls -la\ncd ~/projects\ngit status';
      const result = parseZshHistoryContent(content);

      expect(result.commands.length).toBe(3);
      expect(result.commands[0].command).toBe('ls -la');
      expect(result.commands[0].timestamp).toBeUndefined();
    });

    it('should handle empty content', () => {
      const result = parseZshHistoryContent('');
      expect(result.commands.length).toBe(0);
    });
  });

  describe('isExtendedFormat', () => {
    it('should detect extended format', () => {
      const content = ': 1704067200:0;ls -la\n: 1704067260:5;cd ~/projects';
      expect(isExtendedFormat(content)).toBe(true);
    });

    it('should detect simple format', () => {
      const content = 'ls -la\ncd ~/projects\ngit status';
      expect(isExtendedFormat(content)).toBe(false);
    });

    it('should handle mixed content (majority wins)', () => {
      const content = ': 1704067200:0;ls -la\ncd ~/projects\n: 1704067260:0;git status';
      // 2 extended, 1 simple - should return true
      expect(isExtendedFormat(content)).toBe(true);
    });
  });
});
