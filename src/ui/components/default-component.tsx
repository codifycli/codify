import { Form, FormProps } from '@codifycli/ink-form';
import { PasswordInput, Select } from '@inkjs/ui';
import chalk from 'chalk';
import { Box, Static, Text } from 'ink';
import { useAtom } from 'jotai';
import { EventEmitter } from 'node:events';
import React, { useLayoutEffect, useState } from 'react';

import { Plan } from '../../entities/plan.js';
import { ImportResult } from '../../orchestrators/import.js';
import { FileModificationResult } from '../../utils/file-modification-calculator.js';
import { RenderEvent } from '../reporters/reporter.js';
import { RenderStatus, store } from '../store/index.js';
import { FileModificationDisplay } from './file-modification/FileModification.js';
import { ImportResultComponent } from './import/import-result.js';
import { PlanComponent } from './plan/plan.js';
import { ProgressDisplay } from './progress/progress-display.js';

const spinnerEmitter = new EventEmitter();

export function DefaultComponent(props: {
  emitter: EventEmitter
}) {
  const { emitter } = props
  const [disableSudoPrompt, setDisableSudoPrompt] = useState(false);
  const [{ status: renderStatus, data: renderData }] = useAtom(store.renderState);

  // Use layoutEffect runs before the first render, whereas useEffect runs after
  useLayoutEffect(() => {
    emitter.on(RenderEvent.LOG, (log: string) => {
      console.log(chalk.cyan(log));
      spinnerEmitter.emit('data');
    });
    
    emitter.on(RenderEvent.DISABLE_SUDO_PROMPT, (isDisabled) => {
      setDisableSudoPrompt(isDisabled);
    })
  }, []);

  return <Box flexDirection="column">
    {
      renderStatus === RenderStatus.DISPLAY_MESSAGE && (
        <Text>{renderData as string}</Text>
      )
    }
    {
      renderStatus === RenderStatus.PROGRESS && (
        <ProgressDisplay emitter={spinnerEmitter} eventType="data"/>
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
          <Select onChange={(value) => emitter.emit(RenderEvent.PROMPT_RESULT, value === 'yes')} options={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}/>
        </Box>
      )
    }
    {
      renderStatus === RenderStatus.PROMPT_OPTIONS && (
        <Box flexDirection="column">
          <Text>{(renderData as any).message}</Text>
          <Select onChange={(value) => emitter.emit(RenderEvent.PROMPT_RESULT, value)} options={
            (renderData as any).options.map((option) => ({
              label: option, value: option
            }))
          }/>
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
      renderStatus === RenderStatus.IMPORT_PROMPT && (
        <Form onSubmit={(result) => {
          emitter.emit(RenderEvent.PROMPT_IMPORT_PARAMETERS_RESULT, result)
        }} { ...renderData as FormProps}/>
      )
    }
    {
      renderStatus === RenderStatus.DISPLAY_IMPORT_RESULT && (
        <Static items={[renderData as { importResult: ImportResult; showConfigs: boolean }]}>{
          (renderData, idx) => <ImportResultComponent importResult={renderData.importResult} key={idx} showConfigs={renderData.showConfigs} />
        }</Static>
      )
    }
    {
      renderStatus === RenderStatus.DISPLAY_FILE_MODIFICATION && (
        <Static items={[renderData as Array<{ file: string; modification: FileModificationResult }>]}>{
          (data, idx) => <FileModificationDisplay data={data} key={idx}/>
        }</Static>
      )
    }
  </Box>
}
