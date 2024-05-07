import { Spinner, StatusMessage } from '@inkjs/ui';
import { Box, Static, Text } from 'ink';
import { EventEmitter } from 'node:events';
import React, { useEffect, useState } from 'react';

import { ProcessState, ProcessStatus } from '../reporters/default-reporter.js';

export function PlanComponent({ eventTarget }: { eventTarget: EventEmitter }) {
  const [staticOutput, setStaticOutput] = useState([] as Array<string>);
  const [processState, setProcessState] = useState({
    process: [],
  } as ProcessState);

  useEffect(() => {
    eventTarget.on('static_output', (newValue: any) => {
      setStaticOutput([...newValue]);
    });

    eventTarget.on('process', (state: ProcessState) => {
      setProcessState(structuredClone(state));
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
  </Box>
}
