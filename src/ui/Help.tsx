/**
 * Help Component
 *
 * Displays keyboard shortcuts and usage instructions.
 */

import { Box, Text, useInput } from 'ink';

interface HelpProps {
  onClose: () => void;
}

export function Help({ onClose }: HelpProps) {
  useInput((input, key) => {
    // Any key closes help
    if (key.escape || input === 'q' || input === '?' || key.return) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">📖 GRIMOIRE - Keyboard Shortcuts</Text>
      <Text> </Text>

      <Text bold>Navigation:</Text>
      <Text>  ↑/↓ or j/k    Move selection up/down</Text>
      <Text>  g             Jump to top</Text>
      <Text>  G             Jump to bottom</Text>
      <Text>  Enter         View command details</Text>
      <Text> </Text>

      <Text bold>Search:</Text>
      <Text>  /             Enter search mode</Text>
      <Text>  (type)        Filter results immediately</Text>
      <Text>  Enter         Confirm search</Text>
      <Text>  Esc           Clear search</Text>
      <Text> </Text>

      <Text bold>Actions:</Text>
      <Text>  f             Toggle favorite</Text>
      <Text>  a / e         Add/edit annotation (in detail view)</Text>
      <Text>  t             Edit tags (in detail view)</Text>
      <Text>  y             Copy command to clipboard</Text>
      <Text> </Text>

      <Text bold>General:</Text>
      <Text>  ?             Show this help</Text>
      <Text>  q             Quit</Text>
      <Text>  Esc           Back / Cancel</Text>
      <Text>  Ctrl+C        Exit immediately</Text>
      <Text> </Text>

      <Text dimColor>Press any key to close...</Text>
    </Box>
  );
}
