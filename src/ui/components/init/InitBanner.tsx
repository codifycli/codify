import { Box, Text, useInput } from 'ink';
import { StaticOutput } from '../static-output.js';
import BigText from 'ink-big-text';
import Gradient from 'ink-gradient';
import EventEmitter from 'node:events';
import React from 'react';

import { RenderEvent } from '../../reporters/reporter.js';

export function InitBanner(props: { emitter: EventEmitter }) {
  useInput((_, key) => {
    if (key.return) {
      props.emitter.emit(RenderEvent.PROMPT_RESULT);
    }
  });

  return <Box flexDirection='column'>
    <StaticOutput items={[{}]} style={{ width: '100%' }}>{
      () => <Box flexDirection='column' key='0'>
        <Gradient name='morning'>
          <BigText font='tiny' text='Codify'/>
        </Gradient>
        <Text>Codify is a configuration-as-code tool that helps you setup and manage your system.</Text>
        <Text>Use this init flow to get started quickly with Codify.</Text>
        <Text> </Text>
        <Text bold>Codify will scan your system for any supported programs or settings and automatically generate configs for you.</Text>
      </Box>
    }</StaticOutput>
    <Text dimColor>Press Enter to continue</Text>
  </Box>
}
