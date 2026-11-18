import { Box, Static, Text, useInput } from 'ink';
import React from 'react';

export function PromptPressKeyToContinue(props: {
  message?: string;
  onInput: () => void
}) {
  useInput(() => {
    props.onInput();
  });

  return <Static items={[{}]} style={{ width: '100%' }}>{
    (item, idx) => (<Box flexDirection='column' key={idx} marginTop={1}>
      { props.message && (<Text wrap='wrap'>{props.message}</Text>) }
      <Text> </Text>
      <Text color='gray' dimColor>{'<Press any key to continue>'}</Text>
    </Box>)
  }</Static>
}
