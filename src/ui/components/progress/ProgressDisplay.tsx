import { StatusMessage } from '@inkjs/ui';
import { Box } from 'ink';
import EventEmitter from 'node:events';
import React from 'react';

import Spinner from './Spinner.js';

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
    emitter: EventEmitter,
    eventType: string,
  }
) {
  const { label, status, subProgresses } = props.progress;

  return <Box flexDirection="column">
    {
      status === ProgressStatus.IN_PROGRESS
        ? <Spinner type="circleHalves" eventEmitter={props.emitter} eventType={props.eventType} label={label}/>
        : <StatusMessage variant="success">{label}</StatusMessage>
    }
    <Box flexDirection="column" marginLeft={2}>
      <SubProgressDisplay emitter={props.emitter} eventType={props.eventType} subProgresses={subProgresses} />
    </Box>
  </Box>
}

export function SubProgressDisplay(
  props: {
    subProgresses: ProgressState['subProgresses'],
    emitter: EventEmitter,
    eventType: string,
  }
) {
  const { subProgresses, emitter, eventType } = props;

  return <>{
    subProgresses && subProgresses.map((s, idx) =>
      s.status === ProgressStatus.IN_PROGRESS
        ? <Spinner eventEmitter={emitter} eventType={eventType} key={idx} label={s.label} type="circleHalves"/>
        : <StatusMessage key={idx} variant="success">{s.label}</StatusMessage>
    )
  }</>
}
