/**
 * Detail Component
 *
 * Displays detailed information about a single command:
 * - Full command text
 * - Timestamps (first seen, last run)
 * - Run count
 * - Annotation (with edit capability)
 * - Tags (with edit capability)
 * - Favorite status
 * - Private status
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import clipboardy from 'clipboardy';
import type { Command } from '../services/CommandStore.js';

interface DetailProps {
  command: Command;
  onBack: () => void;
  onToggleFavorite: () => void;
  onTogglePrivate: () => void;
  onUpdateAnnotation: (annotation: string | null) => void;
  onUpdateTags: (tags: string[]) => void;
  onExecute?: () => void;
}

type EditMode = 'none' | 'annotation' | 'tags';

/**
 * Format a Unix timestamp as a readable date string
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format a Unix timestamp as a relative time string
 */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
  return `${Math.floor(diff / 2592000)} months ago`;
}

export function Detail({ command, onBack, onToggleFavorite, onTogglePrivate, onUpdateAnnotation, onUpdateTags, onExecute }: DetailProps) {
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [annotationInput, setAnnotationInput] = useState(command.annotation || '');
  const [tagsInput, setTagsInput] = useState(command.tags?.join(', ') || '');
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useInput((input, key) => {
    if (editMode !== 'none') {
      // In edit mode, handle save/cancel
      if (key.escape) {
        setEditMode('none');
        // Reset inputs
        setAnnotationInput(command.annotation || '');
        setTagsInput(command.tags?.join(', ') || '');
      } else if (key.return) {
        if (editMode === 'annotation') {
          onUpdateAnnotation(annotationInput.trim() || null);
        } else if (editMode === 'tags') {
          const tags = tagsInput
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);
          onUpdateTags(tags);
        }
        setEditMode('none');
      }
      return;
    }

    // Normal mode
    if (key.escape || input === 'q') {
      onBack();
      return;
    }

    if (input === 'f') {
      onToggleFavorite();
      return;
    }

    if (input === 'e' || input === 'a') {
      setAnnotationInput(command.annotation || '');
      setEditMode('annotation');
      return;
    }

    if (input === 't') {
      setTagsInput(command.tags?.join(', ') || '');
      setEditMode('tags');
      return;
    }

    if (input === 'y') {
      // Copy command to clipboard
      try {
        clipboardy.writeSync(command.command);
        setCopyMessage('Copied to clipboard!');
        setTimeout(() => setCopyMessage(null), 2000);
      } catch {
        setCopyMessage('Failed to copy');
        setTimeout(() => setCopyMessage(null), 2000);
      }
      return;
    }

    if (input === 'p') {
      onTogglePrivate();
      return;
    }

    if (input === 'x' && onExecute) {
      onExecute();
      return;
    }
  });

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box borderStyle="single" paddingX={1}>
        <Text bold color="cyan">📖 GRIMOIRE</Text>
        <Text dimColor> &gt; Command Detail</Text>
        <Box flexGrow={1} />
        <Text dimColor>[Esc] Back  [q] Quit</Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" padding={1}>
        {/* Command box */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Command:</Text>
          <Box borderStyle="round" paddingX={1}>
            <Text color="white" bold>{command.command}</Text>
          </Box>
        </Box>

        {/* Metadata */}
        <Box flexDirection="column" marginBottom={1}>
          <Text>First seen:    <Text color="cyan">{formatDate(command.firstSeen)}</Text></Text>
          <Text>Last run:      <Text color="cyan">{formatDate(command.lastSeen)}</Text> <Text dimColor>({formatRelativeTime(command.lastSeen)})</Text></Text>
          <Text>Run count:     <Text color="cyan">{command.runCount}</Text> times</Text>
        </Box>

        {/* Annotation */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Annotation:</Text>
          {editMode === 'annotation' ? (
            <Box borderStyle="double" paddingX={1}>
              <TextInput
                value={annotationInput}
                onChange={setAnnotationInput}
                placeholder="Enter annotation..."
              />
            </Box>
          ) : (
            <Box borderStyle="round" paddingX={1}>
              {command.annotation ? (
                <Text color="cyan">{command.annotation}</Text>
              ) : (
                <Text dimColor>(no annotation - press 'a' to add)</Text>
              )}
            </Box>
          )}
          {editMode === 'annotation' && (
            <Text dimColor>  [Enter] Save  [Esc] Cancel</Text>
          )}
        </Box>

        {/* Tags */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Tags:</Text>
          {editMode === 'tags' ? (
            <Box borderStyle="double" paddingX={1}>
              <TextInput
                value={tagsInput}
                onChange={setTagsInput}
                placeholder="Enter tags (comma separated)..."
              />
            </Box>
          ) : (
            <Box paddingLeft={1}>
              {command.tags && command.tags.length > 0 ? (
                command.tags.map((tag, i) => (
                  <Text key={tag} color="magenta">
                    [{tag}]{i < command.tags!.length - 1 ? ' ' : ''}
                  </Text>
                ))
              ) : (
                <Text dimColor>(no tags - press 't' to add)</Text>
              )}
            </Box>
          )}
          {editMode === 'tags' && (
            <Text dimColor>  [Enter] Save  [Esc] Cancel</Text>
          )}
        </Box>

        {/* Favorite status */}
        <Box marginBottom={1}>
          {command.favorite ? (
            <Text color="yellow">★ Favorited</Text>
          ) : (
            <Text dimColor>☆ Not favorited</Text>
          )}
          <Text>  </Text>
          {command.private ? (
            <Text color="red">🔒 Private (excluded from export)</Text>
          ) : (
            <Text dimColor>🔓 Public</Text>
          )}
        </Box>

        {/* Copy message */}
        {copyMessage && (
          <Box marginBottom={1}>
            <Text color="green">✓ {copyMessage}</Text>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          e/a Annotation   t Tags   f Fav   p Private   y Copy   x Execute   Esc Back
        </Text>
      </Box>
    </Box>
  );
}
