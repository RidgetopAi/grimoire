/**
 * Search Component
 *
 * Provides the search input bar with:
 * - Text input when active
 * - Placeholder when inactive
 * - Result count display
 */

import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface SearchProps {
  isActive: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  resultCount: number;
}

export function Search({ isActive, query, onQueryChange, resultCount }: SearchProps) {
  return (
    <Box borderStyle="single" borderTop={false} paddingX={1}>
      <Text>🔍 Search: </Text>
      {isActive ? (
        <TextInput
          value={query}
          onChange={onQueryChange}
          placeholder="Type to filter commands..."
        />
      ) : (
        <Text dimColor>
          {query || 'Press / to search'}
        </Text>
      )}
      <Box flexGrow={1} />
      {query && (
        <Text dimColor>{resultCount} results  </Text>
      )}
      <Text dimColor>[/] Focus  [Esc] Clear</Text>
    </Box>
  );
}
