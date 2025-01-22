import { Box, Text } from 'ink';
import React from 'react';

export function CompletionSection() {
  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>🎉 Finished applying 🎉</Text>
      <Text>Open a new terminal or source '.zshrc' for the new changes to be reflected</Text>
    </Box>
  );
}
