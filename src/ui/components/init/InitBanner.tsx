import { Box, Text, useInput } from 'ink';
import { StaticOutput } from '../static-output.js';
import EventEmitter from 'node:events';
import React from 'react';

import { RenderEvent } from '../../reporters/reporter.js';

// "Codify" in the cfonts `tiny` font, colored left to right with the `morning` gradient of gradient-string
// (#ff5f6d -> #ffc371, HSV), the same output ink-big-text + ink-gradient rendered.
const LOGO_LINES = [
  ' █▀▀ █▀█ █▀▄ █ █▀▀ █▄█',
  ' █▄▄ █▄█ █▄▀ █ █▀   █ ',
];

const LOGO_COLORS = [
  '#ff5f6d', '#ff6069', '#ff6165', '#ff6362', '#ff6962', '#ff6e63', '#ff7464', '#ff7a65', '#ff7f66', '#ff8567', '#ff8a68',
  '#ff9068', '#ff9569', '#ff9a6a', '#ffa06b', '#ffa56c', '#ffaa6d', '#ffaf6e', '#ffb46e', '#ffb96f', '#ffbe70', '#ffc371',
];

function Logo() {
  // cfonts surrounds the text with two empty lines
  return <Text>{'\n\n'}{LOGO_LINES.map((line, lineIdx) => (
    <React.Fragment key={lineIdx}>
      {[...line].map((char, idx) => <Text color={LOGO_COLORS[idx]} key={idx}>{char}</Text>)}
      {'\n'}
    </React.Fragment>
  ))}{'\n'}</Text>;
}

export function InitBanner(props: { emitter: EventEmitter }) {
  useInput((_, key) => {
    if (key.return) {
      props.emitter.emit(RenderEvent.PROMPT_RESULT);
    }
  });

  return <Box flexDirection='column'>
    <StaticOutput items={[{}]} style={{ width: '100%' }}>{
      () => <Box flexDirection='column' key='0'>
        <Logo/>
        <Text>Codify is a configuration-as-code tool that helps you setup and manage your system.</Text>
        <Text>Use this init flow to get started quickly with Codify.</Text>
        <Text> </Text>
        <Text bold>Codify will scan your system for any supported programs or settings and automatically generate configs for you.</Text>
      </Box>
    }</StaticOutput>
    <Text dimColor>Press Enter to continue</Text>
  </Box>
}
