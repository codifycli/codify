import { PasswordInput, Select } from '@inkjs/ui';
import chalk from 'chalk';
import { Box, Static, Text } from 'ink';
import { EventEmitter } from 'node:events';
import React, { useLayoutEffect, useState } from 'react';

import { Plan } from '../../entities/plan.js';
import { ImportResult, RequiredParameters } from '../../orchestrators/import.js';
import { RenderEvent, RenderState } from '../reporters/reporter.js';
import { ImportResultComponent } from './import/import-result.js';
import { ImportParametersForm } from './import/index.js';
import { PlanComponent } from './plan/plan.js';
import { ProgressDisplay, ProgressState } from './progress/progress-display.js';

const spinnerEmitter = new EventEmitter();

export function DefaultComponent(props: {
  emitter: EventEmitter
}) {
  const { emitter } = props;

  const [state, setState] = useState(RenderState.GENERATING_PLAN);
  const [progressState, setProgressState] = useState(null as ProgressState | null);
  const [hideProgress, setHideProgress] = useState(false);
  const [plan, setPlan] = useState(null as Plan | null);
  const [showSudoPrompt, setShowPromptSudo] = useState(false);
  const [requiredParametersForImport, setRequiredParametersForImport] = useState<RequiredParameters | null>(null);
  const [showImportParametersPrompt, setShowImportParametersPrompt] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [sudoAttemptCount, setSudoAttemptCount] = useState(0);
  const [confirmationMessage, setConfirmationMessage] = useState('');

  // Use layoutEffect runs before the first render, whereas useEffect runs after
  useLayoutEffect(() => {
    emitter.on(RenderEvent.STATE_TRANSITION, (obj) => {
      switch (obj.nextState) {
        case RenderState.DISPLAY_PLAN: {
          setProgressState(null);
          setPlan(obj.plan);
          break;
        }

        case RenderState.DISPLAY_IMPORT_RESULT: {
          setProgressState(null);
          setImportResult(obj.importResult);
          break;
        }

        case RenderState.PROMPT_CONFIRMATION: {
          setConfirmationMessage(obj.message)
          break;
        }
      }

      setState(obj.nextState);
    })

    emitter.on(RenderEvent.LOG, (log: string) => {
      console.log(chalk.cyan(log));
      spinnerEmitter.emit('data');
    });

    emitter.on(RenderEvent.PROGRESS_UPDATE, (state: ProgressState) => {
      setProgressState(structuredClone(state));
    });

    emitter.on(RenderEvent.PROMPT_SUDO, (attemptCount) => {
      setShowPromptSudo(true);
      setHideProgress(true)
      setSudoAttemptCount(attemptCount ?? 0);
    });

    emitter.on(RenderEvent.PROMPT_SUDO_GRANTED, () => {
      setShowPromptSudo(false);
      setHideProgress(false)
      setSudoAttemptCount(0);
    });

    emitter.on(RenderEvent.PROMPT_SUDO_ERROR, () => {
      setShowPromptSudo(false);
      setSudoAttemptCount(0);
    });

    emitter.on(RenderEvent.PROMPT_IMPORT_PARAMETERS, (requiredParameters) => {
      setHideProgress(true);
      setRequiredParametersForImport(requiredParameters);
      setShowImportParametersPrompt(true);
    })

    emitter.on(RenderEvent.PROMPT_IMPORT_PARAMETERS_RESULT, () => {
      setHideProgress(false);
      setRequiredParametersForImport(null);
      setShowImportParametersPrompt(false);
    })
  }, []);

  return <Box flexDirection="column">
    {
      ([RenderState.APPLY_COMPLETE, RenderState.APPLYING, RenderState.GENERATING_PLAN].includes(state)) && progressState && !hideProgress && (
        <ProgressDisplay emitter={spinnerEmitter} eventType="data" progress={progressState}/>
      )
    }
    {
      state >= RenderState.DISPLAY_PLAN && plan && <Static items={[plan]}>{
        (plan, idx) => <PlanComponent key={idx} plan={plan}/>
      }</Static>
    }
    {
      state === RenderState.PROMPT_CONFIRMATION && (
        <Box flexDirection="column">
          <Text>{confirmationMessage}</Text>
          <Select onChange={(value) => emitter.emit(RenderEvent.PROMPT_CONFIRMATION_RESULT, value === 'yes')} options={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}/>
        </Box>
      )
    }
    {
      state === RenderState.APPLY_COMPLETE && (
        <Box flexDirection="column">
          <Text> </Text>
          <Text>🎉 Finished applying 🎉</Text>
          <Text>Open a new terminal or source '.zshrc' for the new changes to be reflected</Text>
        </Box>
      )
    }
    {
      showSudoPrompt && (
        <Box flexDirection="column">
          <Text>Password:</Text>
          {/* Use sudoAttemptCount as a hack to reset password input between attempts */}
          <PasswordInput key={sudoAttemptCount} onSubmit={(password) => {
            emitter.emit(RenderEvent.PROMPT_SUDO_RESULT, password);
          }}/>
        </Box>
      )
    }
    {
      showImportParametersPrompt && requiredParametersForImport && (
        <ImportParametersForm onSubmit={(result) => {
          emitter.emit(RenderEvent.PROMPT_IMPORT_PARAMETERS_RESULT, result)
        }} requiredParameters={requiredParametersForImport}/>
      )
    }
    {
      state === RenderState.DISPLAY_IMPORT_RESULT && importResult && (
        <Static items={[importResult]}>{
          (importResult, idx) => <ImportResultComponent importResult={importResult} key={idx} />
        }</Static>
      )
    }
  </Box>
}
