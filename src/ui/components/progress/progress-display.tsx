import { Spinner as AutomatedSpinner, StatusMessage } from '@inkjs/ui';
import { Box } from 'ink';
import { useAtom } from 'jotai';
import React from 'react';

import { store } from '../../store/index.js';

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

export function ProgressDisplay() {
  const [progress] = useAtom(store.progressState);
  if (!progress) {
    return;
  }

  const { label, status, subProgresses } = progress;

  return <Box flexDirection="column">
    {
      status === ProgressStatus.IN_PROGRESS
        ? <AutomatedSpinner label={label} type="circleHalves" />
        : <StatusMessage variant="success">{label}</StatusMessage>
    }
    <Box flexDirection="column" marginLeft={2}>
      <SubProgressDisplay subProgresses={subProgresses}/>
    </Box>
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
          ? <AutomatedSpinner key={idx} label={s.label} type="circleHalves" />
          : <StatusMessage key={idx} variant="success">{s.label}</StatusMessage>
      )
  }</>
}
