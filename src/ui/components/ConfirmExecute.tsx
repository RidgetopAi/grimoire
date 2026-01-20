/**
 * ConfirmExecute Component
 *
 * A confirmation dialog before executing a command.
 * Shows the command and waits for y/n confirmation.
 */

import { Box, Text, useInput } from 'ink';

interface ConfirmExecuteProps {
  command: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmExecute({ command, onConfirm, onCancel }: ConfirmExecuteProps) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N' || key.escape) {
      onCancel();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      marginX={4}
      marginY={2}
    >
      <Box marginBottom={1}>
        <Text bold color="yellow">⚠️  Execute Command?</Text>
      </Box>

      <Box borderStyle="round" paddingX={1} marginBottom={1}>
        <Text color="white" bold>{command}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>This will run the command in your shell.</Text>
      </Box>

      <Box>
        <Text>Press </Text>
        <Text color="green" bold>y</Text>
        <Text> to execute, </Text>
        <Text color="red" bold>n</Text>
        <Text> to cancel</Text>
      </Box>
    </Box>
  );
}
