import { StatusMessage } from '@inkjs/ui';
import { Box } from 'ink';
import EventEmitter from 'node:events';
import React, { useLayoutEffect, useState } from 'react';

import Spinner from './spinner.js';
import { ctx, Event, ProcessName, SubProcessName } from '../../../events/context.js';
import chalk from 'chalk';
import { createUseStore } from '../../hooks/store.js';

const ProgressLabelMapping = {
  [ProcessName.APPLY]: 'Codify apply',
  [ProcessName.PLAN]: 'Codify plan',
  [ProcessName.DESTROY]: 'Codify destroy',
  [ProcessName.IMPORT]: 'Codify import',
  [SubProcessName.APPLYING_RESOURCE]: 'Applying resource',
  [SubProcessName.GENERATE_PLAN]: 'Refresh states and generating plan',
  [SubProcessName.INITIALIZE_PLUGINS]: 'Initializing plugins',
  [SubProcessName.PARSE]: 'Parsing configs',
  [SubProcessName.VALIDATE]: 'Validating configs',
  [SubProcessName.GET_REQUIRED_PARAMETERS]: 'Getting required parameters',
  [SubProcessName.IMPORT_RESOURCE]: 'Importing resource'
}

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

/**
 * This component directly subscribes to the global event bus to listen for progress updates. That is why there are no
 * props.
 * Note: New process_start events will completely wipe out the old ones.
 */
export function ProgressDisplay() {
  const [progressState, setProgressState] = useState({} as ProgressState | undefined);

  useLayoutEffect(() => {
    ctx.on(Event.PROCESS_START, (name) => onProcessStartEvent(name))
    ctx.on(Event.PROCESS_FINISH, (name) => onProcessFinishEvent(name))
    ctx.on(Event.SUB_PROCESS_START, (name, additionalName) => onSubprocessStartEvent(name, additionalName));
    ctx.on(Event.SUB_PROCESS_FINISH, (name, additionalName) => onSubprocessFinishEvent(name, additionalName))
  }, []);

  const onProcessStartEvent = (name: ProcessName) => {
    const label = ProgressLabelMapping[name];

    log(`${label} started`)
    setProgressState({
      label: label + '...',
      name,
      status: ProgressStatus.IN_PROGRESS,
      subProgresses: [],
    });
  }

  const onProcessFinishEvent = (name: ProcessName) => {
    const label = ProgressLabelMapping[name];

    log(`${label} finished successfully`)
    setProgressState((state) => {
      state!.status = ProgressStatus.FINISHED;
      return structuredClone(state);
    })
  }

  const onSubprocessStartEvent = (name: SubProcessName, additionalName?: string) => {
    const label = ProgressLabelMapping[name] + (additionalName
        ? ' ' + additionalName
        : ''
    );

    log(`${label} started`)

    setProgressState((state) => {
      state?.subProgresses?.push({
        label,
        name: name + additionalName,
        status: ProgressStatus.IN_PROGRESS,
      });

      return structuredClone(state);
    })
  }

  const onSubprocessFinishEvent = (name: SubProcessName, additionalName?: string) =>  {
    const label = ProgressLabelMapping[name] + (additionalName
        ? ' ' + additionalName
        : ''
    );

    log(`${label} finished successfully`)
    setProgressState((state) => {
      const subProgress = state
        ?.subProgresses
        ?.find((p) => p.name === name + additionalName);

      if (!subProgress) {
        return state;
      }

      subProgress.status = ProgressStatus.FINISHED;

      return structuredClone(state);
    })
  }

  const log = (log: unknown) => {
    console.log(chalk.cyan(log));
  }

  if (!progressState) {
    return <Box></Box>
  }

  const { label, status, subProgresses } = progressState;
  return <Box flexDirection="column">
    {
      status === ProgressStatus.IN_PROGRESS
        ? <Spinner type="circleHalves" eventEmitter={ctx.emitter} eventType={Event.OUTPUT} label={label}/>
        : <StatusMessage variant="success">{label}</StatusMessage>
    }
    <Box flexDirection="column" marginLeft={2}>
      <SubProgressDisplay subProgresses={subProgresses} />
    </Box>
  </Box>
}

export function SubProgressDisplay(
  props: { subProgresses: ProgressState['subProgresses'] }
) {
  const { subProgresses } = props;

  return <>{
    subProgresses && subProgresses.map((s, idx) =>
      s.status === ProgressStatus.IN_PROGRESS
        ? <Spinner eventEmitter={ctx.emitter} eventType={Event.OUTPUT} key={idx} label={s.label} type="circleHalves"/>
        : <StatusMessage key={idx} variant="success">{s.label}</StatusMessage>
    )
  }</>
}
