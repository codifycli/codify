import { Spinner, StatusMessage } from '@inkjs/ui';
import { Box, Text } from 'ink';
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
    progress?: ProgressState,
  }
) {
  if (!props.progress) {
    return <Box></Box>
  }

  const { label, status, subProgresses } = props.progress;

  return <Box flexDirection="column">
    {
      status === ProgressStatus.IN_PROGRESS
        ? <Spinner label={label}/>
        : <StatusMessage variant="success">{label}</StatusMessage>
    }
    <Box flexDirection="column" marginLeft={2}>
      {
        subProgresses?.map((p, idx) =>
          p.status === ProgressStatus.IN_PROGRESS
            ? <Spinner key={p.label} label={p.label}/>
            : <StatusMessage key={idx} variant="success">{p.label}</StatusMessage>
        )
      }
    </Box>
  </Box>
}

export function SubProgressDisplay(
  props: {
    subProgresses: ProgressState['subProgresses'],
  }
) {
  const { subProgresses } = props;

  console.log(subProgresses?.length);

  return <>{
    subProgresses && subProgresses.map((s, idx) =>
        // s.status === ProgressStatus.IN_PROGRESS
        // ? <Text key={idx}>{s.label}</Text>
        <Spinner key={s.label} label={s.label}/>
      // : <StatusMessage key={idx} variant="success">{s.label}</StatusMessage>
      // : <Text key={idx}>{s.label}</Text>
    )
  }</>
}
