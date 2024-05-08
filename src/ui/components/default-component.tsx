import { Select } from '@inkjs/ui';
import chalk from 'chalk';
import { PlanResponseData } from 'codify-schemas';
import { Box, Static, Text } from 'ink';
import { EventEmitter } from 'node:events';
import React, { useLayoutEffect, useState } from 'react';

import { RenderEvent, RenderState } from '../reporters/reporter.js';
import { PlanComponent } from './plan/plan.js';
import { ProgressDisplay, ProgressState } from './progress/progress-display.js';

export function DefaultComponent(props: {
  emitter: EventEmitter
}) {
  const { emitter } = props;

  const [state, setState] = useState(RenderState.GENERATING_PLAN);
  const [progressState, setProgressState] = useState(null as ProgressState | null);
  const [plan, setPlan] = useState(null as PlanResponseData[] | null);

  // Use layoutEffect runs before the first render, whereas useEffect runs after
  useLayoutEffect(() => {
    emitter.on(RenderEvent.STATE_TRANSITION, (obj) => {
      switch (obj.nextState) {
        case RenderState.DISPLAY_PLAN: {
          setProgressState(null);
          setPlan(obj.plan);
          break;
        }
      }

      setState(obj.nextState);
    })

    emitter.on(RenderEvent.LOG, (log: string) => {
      console.log(chalk.cyan(log))
    });

    emitter.on(RenderEvent.PROGRESS_UPDATE, (state: ProgressState) => {
      setProgressState(structuredClone(state));
    });
  }, []);

  return <Box flexDirection="column">
    {
      (state === RenderState.GENERATING_PLAN || state === RenderState.APPLYING) && progressState && (
        <ProgressDisplay progress={progressState}/>
      )
    }
    {
      state >= RenderState.DISPLAY_PLAN && plan && <Static items={[plan]}>{
        (plan, idx) => <PlanComponent key={idx} plan={plan}/>
      }</Static>
    }
    {
      state === RenderState.PROMPT_APPLY_CONFIRMATION && (
        <Box flexDirection="column">
          <Text>Do you want to apply the above changes?</Text>
          <Select onChange={(value) => emitter.emit(RenderEvent.PROMPT_RESULT, value === 'yes')} options={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}/>
        </Box>
      )
    }
  </Box>
}
