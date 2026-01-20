/**
 * QuickEdit Component
 *
 * A modal overlay for quickly editing annotation or tags from browse view.
 * Appears as a floating box in the center of the screen.
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Command } from '../../services/CommandStore.js';

type EditType = 'annotation' | 'tags';

interface QuickEditProps {
  command: Command;
  editType: EditType;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function QuickEdit({ command, editType, onSave, onCancel }: QuickEditProps) {
  const initialValue = editType === 'annotation'
    ? (command.annotation || '')
    : (command.tags?.join(', ') || '');

  const [value, setValue] = useState(initialValue);

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    } else if (key.return) {
      onSave(value);
    }
  });

  const title = editType === 'annotation' ? 'Edit Annotation' : 'Edit Tags';
  const placeholder = editType === 'annotation'
    ? 'Enter annotation...'
    : 'Enter tags (comma separated)...';

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      marginX={4}
      marginY={2}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">{title}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Command: </Text>
        <Text>{command.command.length > 50 ? command.command.slice(0, 47) + '...' : command.command}</Text>
      </Box>

      <Box borderStyle="round" paddingX={1} marginBottom={1}>
        <TextInput
          value={value}
          onChange={setValue}
          placeholder={placeholder}
        />
      </Box>

      <Box>
        <Text dimColor>[Enter] Save   [Esc] Cancel</Text>
      </Box>
    </Box>
  );
}
