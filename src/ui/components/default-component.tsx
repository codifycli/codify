import { Spinner, StatusMessage } from '@inkjs/ui';
import { Box, Static, Text } from 'ink';
import { EventEmitter } from 'node:events';
import React, { useEffect, useState } from 'react';

import { ProcessState, ProcessStatus } from '../reporters/default-reporter.js';
import { PlanResponseData } from 'codify-schemas';
import { PlanComponent } from './plan/plan.js';

export function DefaultComponent(props: {
  emitter: EventEmitter
}) {
  const { emitter } = props;

  const [staticOutput, setStaticOutput] = useState([] as Array<string>);
  const [processState, setProcessState] = useState({
    process: [],
  } as ProcessState);
  const [planState, setPlanState] = useState(null as PlanResponseData[] | null);

  useEffect(() => {
    emitter.on('static_output', (newValue: any) => {
      setStaticOutput([...newValue]);
    });

    emitter.on('process', (state: ProcessState) => {
      setProcessState(structuredClone(state));
    });

    emitter.on('plan', (plan: PlanResponseData[]) => {
      setPlanState(plan);
    });
  }, []);

  return <Box flexDirection="column">
    <Static items={staticOutput}>
      {
        (text, idx) => <Text color="cyan" key={idx}>{text}</Text>
      }
    </Static>
    {
      processState.process?.map((item, i) =>
        <Box flexDirection="column" key={i}>
          {
            item.status === ProcessStatus.IN_PROGRESS
              ? <Spinner label={item.name}/>
              : <StatusMessage variant="success">{item.name}</StatusMessage>
          }
          <Box flexDirection="column" marginLeft={2}>
            {
              item.subprocess?.map((subItem, i) =>
                subItem.status === ProcessStatus.IN_PROGRESS
                  ? <Spinner key={i} label={subItem.name}/>
                  : <StatusMessage key={i} variant="success">{subItem.name}</StatusMessage>
              ) ?? []
            }
          </Box>
        </Box>
      ) ?? []
    }
    {
      planState
        ? <Static items={[planState]}>{
          (plan, idx) => <PlanComponent key={idx} plan={plan}/>
        }</Static>
        : <></>
    }
  </Box>
}
