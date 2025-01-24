import { PasswordInput, Select } from '@inkjs/ui';
import chalk from 'chalk';
import { Box, Static, Text } from 'ink';
import { useAtom } from 'jotai';
import { EventEmitter } from 'node:events';
import React, { useLayoutEffect, useState } from 'react';

import { Plan } from '../../entities/plan.js';
import { ImportResult, RequiredParameters } from '../../orchestrators/import.js';
import { RenderEvent, RenderState } from '../reporters/reporter.js';
import { RenderStatus, store } from '../store/index.js';
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
  // const [progressState, setProgressState] = useState(null as ProgressState | null);
  const [hideProgress, setHideProgress] = useState(false);
  const [plan, setPlan] = useState(null as Plan | null);
  const [showSudoPrompt, setShowPromptSudo] = useState(false);
  const [requiredParametersForImport, setRequiredParametersForImport] = useState<RequiredParameters | null>(null);
  const [showImportParametersPrompt, setShowImportParametersPrompt] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [sudoAttemptCount, setSudoAttemptCount] = useState(0);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [disableSudoPrompt, setDisableSudoPrompt] = useState(false);
  
  const [{ status: renderStatus, data: renderData }] = useAtom(store.renderState);
  const [progressState] = useAtom(store.progressState);

  // Use layoutEffect runs before the first render, whereas useEffect runs after
  useLayoutEffect(() => {
    emitter.on(RenderEvent.STATE_TRANSITION, (obj) => {
      switch (obj.nextState) {
        case RenderState.DISPLAY_PLAN: {
          // setProgressState(null);
          setPlan(obj.plan);
          break;
        }

        case RenderState.DISPLAY_IMPORT_RESULT: {
          // setProgressState(null);
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
      // setProgressState(structuredClone(state));
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
    
    emitter.on(RenderEvent.DISABLE_SUDO_PROMPT, (isDisabled) => {
      setDisableSudoPrompt(isDisabled);
    })
  }, []);

  console.log(renderStatus);
  // console.log(renderData);
  //
  // console.log(renderStatus);
  // console.log(progressState);
  // console.log(renderData);

  return <Box flexDirection="column">
    {
      renderStatus === RenderStatus.PROGRESS && progressState && !hideProgress && (
        <ProgressDisplay emitter={spinnerEmitter} eventType="data" progress={progressState}/>
      )
    }
    {
      renderStatus === RenderStatus.DISPLAY_PLAN && <Static items={[renderData as Plan]}>{
        (plan, idx) => <PlanComponent key={idx} plan={plan}/>
      }</Static>
    }
    {
      renderStatus === RenderStatus.PROMPT_CONFIRMATION && (
        <Box flexDirection="column">
          <Text>{renderData as string}</Text>
          <Select onChange={(value) => emitter.emit(RenderEvent.PROMPT_CONFIRMATION_RESULT, value === 'yes')} options={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}/>
        </Box>
      )
    }
    {
      renderStatus === RenderStatus.APPLY_COMPLETE && (
        <Box flexDirection="column">
          <Text> </Text>
          <Text>🎉 Finished applying 🎉</Text>
          <Text>Open a new terminal or source '.zshrc' for the new changes to be reflected</Text>
        </Box>
      )
    }
    {
      renderStatus === RenderStatus.SUDO_PROMPT && (
        <Box flexDirection="column">
          <Text>Password:</Text>
          {/* Use sudoAttemptCount as a hack to reset password input between attempts */}
          <PasswordInput isDisabled={disableSudoPrompt} key={renderData as number} onSubmit={(password) => {
            emitter.emit(RenderEvent.SUDO_PROMPT_RESULT, password);
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
