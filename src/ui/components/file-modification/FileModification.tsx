import { Box, Text } from 'ink';
import React from 'react';

export function FileModificationDisplay(props: {
  diff: string,
}) {
  return <Box flexDirection="column">
    <Box borderColor="green" borderStyle="round">
      <Text>File Modification</Text>
    </Box>
    <Text>The following changes will be made</Text>
    <Text> </Text>
    <Text>{props.diff}</Text>
  </Box>
}
