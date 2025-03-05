import { MultiSelect } from '@inkjs/ui';
import { Box, Text } from 'ink';
import BigText from 'ink-big-text';
import Gradient from 'ink-gradient';
import React from 'react';

export function InitBanner() {
  return <Box flexDirection='column'>
    <Gradient name='morning'>
      <BigText text='Codify' font='tiny'/>
    </Gradient>
    <Text>Use config </Text>
    <Text>Use this init flow to get setup quickly with Codify.</Text>
    <Text> </Text>
    <Text bold>Select which resources to import:</Text>
    <MultiSelect options={[
      { label: 'Test 1', value: 'test 1' },
      { label: 'Test 2', value: 'test 2' },
      { label: 'Test 3', value: 'test 3' },
      { label: 'Test 4', value: 'test 4' },
      { label: 'Test 5', value: 'test 5' },
      { label: 'Test 6', value: 'test 6' },
      { label: 'Test 7', value: 'test 7' },
      { label: 'Test 8', value: 'test 8' },
      { label: 'Test 9', value: 'test 9' },
      { label: 'Test 10', value: 'test 10' },
    ]}/>
  </Box>
}
