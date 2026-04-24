import { Box, Text, useInput } from 'ink';
import { useAtom } from 'jotai';
import { EventEmitter } from 'node:events';
import React, { useState } from 'react';

import { ProcessName } from '../../../events/context.js';
import { RenderEvent } from '../../reporters/reporter.js';
import { store } from '../../store/index.js';
import Spinner from './spinner.js';

export enum ProgressStatus {
  IN_PROGRESS,
  FINISHED,
}

export interface ProgressState {
  name: string,
  label: string;
  status: ProgressStatus;
  subProgresses: Array<{
    name: string,
    label: string;
    status: ProgressStatus;
  }> | null;
}

export function ProgressDisplay(props: { emitter: EventEmitter }) {
  const { emitter } = props;
  const [progress] = useAtom(store.progressState);
  const [isVerbose, setIsVerbose] = useState(false);

  const isApplyOrDestroy = progress?.name === ProcessName.APPLY || progress?.name === ProcessName.DESTROY;

  useInput((input) => {
    if (!isApplyOrDestroy) return;
    if (input === 'v') {
      setIsVerbose((prev) => !prev);
      emitter.emit(RenderEvent.TOGGLE_VERBOSITY);
    }
  });

  if (!progress) {
    return;
  }

  const { label, status, subProgresses } = progress;

  return <Box flexDirection="column">
    {
      status === ProgressStatus.IN_PROGRESS
        ? <Spinner label={label} type="dots" />
        : <Text><Text color='greenBright'>✔</Text> {label}</Text>
    }
    <Box flexDirection="column" marginLeft={2}>
      <SubProgressDisplay subProgresses={subProgresses}/>
    </Box>
    {isApplyOrDestroy && (
      <Text dimColor>{isVerbose ? '[v] Hide verbose logs' : '[v] Show verbose logs'}</Text>
    )}
  </Box>
}

export function SubProgressDisplay(
  props: {
    subProgresses: ProgressState['subProgresses'],
  }
) {
  const { subProgresses } = props;

  return <>{
    subProgresses && subProgresses
      // Sort the subprocesses so that in progress ones are always at the bottom
      .sort((a, b) => a.status === ProgressStatus.IN_PROGRESS ? 1 : -1)
      // Limit the max number of subprocesses to 5. Too many doesn't look good and causes a wasm memory access error (yoga)
      .slice(Math.max(0, subProgresses.length - 5), subProgresses.length)
      .map((s, idx) =>
        s.status === ProgressStatus.IN_PROGRESS
          ? <Spinner key={idx} label={s.label} type="dots" />
          : <Text key={idx}><Text color='greenBright'>✔</Text> {s.label}</Text>
      )
  }</>
}
