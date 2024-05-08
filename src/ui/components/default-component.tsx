import { Select } from '@inkjs/ui';
import { PlanResponseData } from 'codify-schemas';
import { Box, Static, Text } from 'ink';
import { EventEmitter } from 'node:events';
import React, { useEffect, useState } from 'react';

import { RenderEvent, RenderState } from '../reporters/reporter.js';
import { PlanComponent } from './plan/plan.js';
import { ProgressDisplay, ProgressState } from './progress/progress-display.js';

export function DefaultComponent(props: {
  emitter: EventEmitter
}) {
  const { emitter } = props;

  const [state, setState] = useState(RenderState.GENERATING_PLAN);
  const [staticOutput, setStaticOutput] = useState([] as Array<Record<string, unknown> | string>);
  const [progressState, setProgressState] = useState(null as ProgressState | null);
  const [plan, setPlan] = useState(null as PlanResponseData[] | null);
  const [confirmValue, setConfirmValue] = useState(null as boolean | null)

  useEffect(() => {
    emitter.on(RenderEvent.STATE_TRANSITION, (obj) => {
      switch (obj.nextState) {
        case RenderState.GENERATING_PLAN: {
          setProgressState(obj.progressState);
          setState(obj.nextState);
          break;
        }

        case RenderState.DISPLAY_PLAN: {
          setPlan(obj.plan);
          setState(obj.nextState);
          break;
        }

        case RenderState.ASK_CONFIRMATION: {
          setState(obj.nextState);
          break;
        }

        case RenderState.APPLYING: {
          break;
        }
      }
    })

    emitter.once(RenderEvent.LOG, (newValue: string) => {
      setStaticOutput([...newValue]);
    });

    emitter.on(RenderEvent.PROCESS_UPDATE, (state: ProgressState) => {
      setProgressState(structuredClone(state));
    });
  }, []);

  return <Box flexDirection="column">
    <Static items={staticOutput}>
      {
        (text, idx) => <Text color="cyan" key={idx}>{text.toString()}</Text>
      }
    </Static>
    {
      state >= RenderState.DISPLAY_PLAN && plan && <Static items={[plan]}>{
        (plan, idx) => <PlanComponent key={idx} plan={plan}/>
      }</Static>
    }
    {
      (state === RenderState.GENERATING_PLAN || state === RenderState.APPLYING) && progressState &&
      <ProgressDisplay progress={progressState}/>
    }
    {
      state === RenderState.ASK_CONFIRMATION && (
        confirmValue === null
          ? <Box flexDirection="column">
            <Text>Do you want to apply the above changes?</Text>
            <Select onChange={(value) => {
              setConfirmValue(value === 'yes');
              emitter.emit(RenderEvent.PROMPT_RESULT, value === 'yes')
            }} options={[
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: 'no' },
            ]}/>
          </Box>
          : <Box flexDirection="column">
            <Text>Do you want to apply the above changes?</Text>
            <Select highlightText={confirmValue ? 'Yes' : 'No'} isDisabled options={[
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: 'no' },
            ]}/>
          </Box>
      )
    }
  </Box>
}
