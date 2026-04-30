import { Box, Text, useInput } from 'ink';
import { useAtom } from 'jotai';
import { EventEmitter } from 'node:events';
import React, { useState } from 'react';

import { ProcessName } from '../../../events/context.js';
import { VerbosityLevel } from '../../../utils/verbosity-level.js';
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
  const [isVerbose, setIsVerbose] = useState(() => VerbosityLevel.get() > 0);
  const [passwordSaved] = useAtom(store.isSudoPasswordCached);

  const isApplyOrDestroy = progress?.name === ProcessName.APPLY || progress?.name === ProcessName.DESTROY;

  useInput((input) => {
    if (!isApplyOrDestroy) return;
    if (input === 'v') {
      setIsVerbose((prev) => !prev);
      emitter.emit(RenderEvent.TOGGLE_VERBOSITY);
    }
    if (input === 'p' && !passwordSaved) {
      emitter.emit(RenderEvent.SUDO_PASSWORD_TOGGLE);
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
      <Box flexDirection="row" gap={2}>
        <Text dimColor>{isVerbose ? '[v] Hide verbose logs' : '[v] Show verbose logs'}</Text>
        {passwordSaved
          ? <Text color="green">✓ sudo password</Text>
          : <Text dimColor>[p] Enter sudo password</Text>
        }
      </Box>
    )}
  </Box>
}

export function SubProgressDisplay(
  props: {
    subProgresses: ProgressState['subProgresses'],
  }
) {
  const { subProgresses } = props;

  if (!subProgresses) return <></>;

  const MAX_VISIBLE = 5;
  const hiddenCount = Math.max(0, subProgresses.length - MAX_VISIBLE);

  // Take the last (MAX_VISIBLE - 1) chronologically, leaving room for the "and N others" row
  const visibleSlice = subProgresses.slice(Math.max(0, subProgresses.length - (MAX_VISIBLE - 1)));
  // Sort within the visible slice so in-progress items appear at the bottom
  const sorted = [...visibleSlice].sort((a, b) => a.status === ProgressStatus.IN_PROGRESS ? 1 : -1);

  return <>
    {hiddenCount > 0 && (
      <Text dimColor>  and {hiddenCount} other{hiddenCount !== 1 ? 's' : ''}...</Text>
    )}
    {sorted.map((s, idx) =>
      s.status === ProgressStatus.IN_PROGRESS
        ? <Spinner key={idx} label={s.label} type="dots" />
        : <Text key={idx}><Text color='greenBright'>✔</Text> {s.label}</Text>
    )}
  </>
}
