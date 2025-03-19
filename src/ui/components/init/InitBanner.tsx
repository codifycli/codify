import { Select } from '@inkjs/ui';
import { Box, Static, Text } from 'ink';
import BigText from 'ink-big-text';
import Gradient from 'ink-gradient';
import EventEmitter from 'node:events';
import React from 'react';

import { RenderEvent } from '../../reporters/reporter.js';

export function InitBanner(props: { emitter: EventEmitter }) {
  return <Box flexDirection='column'>
    <Static items={[{}]}>{
      () => <Box flexDirection='column' key='0'>
        <Gradient name='morning'>
          <BigText font='tiny' text='Codify'/>
        </Gradient>
        <Text>Codify is a configuration-as-code tool that helps you setup and manage your system.</Text>
        <Text>Use this init flow to get started quickly with Codify.</Text>
        <Text> </Text>
        <Text bold>Codify will scan your system for any supported programs or settings and automatically generate configs for you.</Text>
      </Box>
    }</Static>
    <Select onChange={() => { props.emitter.emit(RenderEvent.PROMPT_RESULT); }} options={[{ label: 'Continue', value: 'Continue' }]}/>
  </Box>
}
