import { Spinner, StatusMessage } from '@inkjs/ui';
import { Box } from 'ink';
import React from 'react';

export enum ProgressStatus {
  IN_PROGRESS,
  FINISHED,
}

export interface ProgressState {
  label: string,
  status: ProgressStatus;
  subProgress: ProgressState[] | null,
}

export function ProgressDisplay(
  props: {
    progress: ProgressState,
  }
) {
  const { label, status, subProgress } = props.progress;

  return <Box flexDirection="column">
    {
      status === ProgressStatus.IN_PROGRESS
        ? <Spinner label={label}/>
        : <StatusMessage variant="success">{label}</StatusMessage>
    }
    {
      subProgress && <Box flexDirection="column" marginLeft={2}>
        <SubProgressDisplay subProgresses={subProgress}/>
      </Box>
    }
  </Box>
}

export function SubProgressDisplay(
  props: {
    subProgresses: ProgressState[],
  }
) {
  const { subProgresses } = props;

  return <>{
             subProgresses.map((s, idx) => <Box>
               {
                 s.status === ProgressStatus.IN_PROGRESS
                   ? <Spinner key={idx} label={s.label}/>
                   : <StatusMessage key={idx} variant="success">{s.label}</StatusMessage>
               }
               {
                 s.subProgress && <Box flexDirection="column" marginLeft={2}>
                   <SubProgressDisplay subProgresses={s.subProgress}/>
                 </Box>
               }
             </Box>)
           }</>
}
