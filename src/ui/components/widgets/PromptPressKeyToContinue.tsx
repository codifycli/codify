import { Box, Text, useInput } from 'ink';
import React from 'react';

export function PromptPressKeyToContinue(props: {
  message?: string;
  onInput: () => void
}) {
  useInput(() => {
    props.onInput();
  });

  return <Box flexDirection='column' marginTop={1}>
    { props.message && (<Text>{props.message}</Text>) }
    <Text> </Text>
    <Text color='gray' dimColor>{'<Press any key to continue>'}</Text>
  </Box>
}
