import { Spinner, StatusMessage } from '@inkjs/ui';
import { Box } from 'ink';
import React from 'react';

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

export function ProgressDisplay(
  props: {
    progress: ProgressState,
  }
) {
  const { label, status, subProgresses } = props.progress;

  return <Box flexDirection="column">
    {
      status === ProgressStatus.IN_PROGRESS
        ? <Spinner label={label}/>
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
    subProgresses && subProgresses.map((s, idx) =>
      s.status === ProgressStatus.IN_PROGRESS
        ? <Spinner key={idx} label={s.label}/>
        : <StatusMessage key={idx} variant="success">{s.label}</StatusMessage>
    )
  }</>
}
