import { Box, Text } from 'ink';
import React from 'react';

import { FileModificationResult } from '../../../generators/index.js';

export function FileModificationDisplay(props: {
  data: Array<{ file: string; modification: FileModificationResult }>,
}) {
  return <Box flexDirection="column">
    <Box borderColor="green" borderStyle="round">
      <Text>File Modifications</Text>
    </Box>
    {
      props.data
        .filter(({ modification }) => modification.diff)
        .map(({ file, modification }, idx) =>
          <Box flexDirection="column" key={idx}>
            <Text backgroundColor='yellow' bold>File {file}</Text>
            <Text> </Text>
            <Text>{modification.diff}</Text>
            <Text> </Text>
          </Box>
        )
    }
  </Box>
}
