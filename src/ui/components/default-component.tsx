import { Form, FormProps } from '@codifycli/ink-form';
import { PasswordInput } from '@inkjs/ui';
import chalk from 'chalk';
import { Box, Static, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { useAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { EventEmitter } from 'node:events';
import React, { useLayoutEffect, useState } from 'react';

import { Plan } from '../../entities/plan.js';
import { ImportResult } from '../../orchestrators/import.js';
import { FileModificationResult } from '../../utils/file-modification-calculator.js';
import { RenderEvent } from '../reporters/reporter.js';
import { RenderStatus, store } from '../store/index.js';
import { FileModificationDisplay } from './file-modification/FileModification.js';
import { ImportResultComponent } from './import/import-result.js';
import { ImportWarning } from './import/import-warning.js';
import { InitBanner } from './init/InitBanner.js';
import { PlanComponent } from './plan/plan.js';
import { ProgressDisplay } from './progress/progress-display.js';
import { MultiSelect } from './multi-select/MultiSelect.js';

const spinnerEmitter = new EventEmitter();

export function DefaultComponent(props: {
  emitter: EventEmitter
}) {
  const { emitter } = props
  const [disableSudoPrompt, setDisableSudoPrompt] = useState(false);
  const [{ status: renderStatus, data: renderData }] = useAtom(store.renderState);
  const logTriggeredSpinner = selectAtom(store.progressState, (progress) => progress?.logTriggeredSpinner ?? false);

  // Use layoutEffect runs before the first render, whereas useEffect runs after
  useLayoutEffect(() => {
    const logListener = (log: string) => {
      console.log(chalk.cyan(log));

      if (logTriggeredSpinner) {
        spinnerEmitter.emit('data');
      }
    };

    emitter.on(RenderEvent.LOG, logListener);

    const disableSudoPrompt = (isDisabled: boolean) => {
      setDisableSudoPrompt(isDisabled);
    }

    emitter.on(RenderEvent.DISABLE_SUDO_PROMPT, disableSudoPrompt)

    return () => {
      emitter.off(RenderEvent.LOG, logListener);
      emitter.off(RenderEvent.DISABLE_SUDO_PROMPT, disableSudoPrompt);
    }
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
          <SelectInput items={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]} onSelect={(value) => emitter.emit(RenderEvent.PROMPT_RESULT, value.value === 'yes')}/>
        </Box>
      )
    }
    {
      renderStatus === RenderStatus.PROMPT_OPTIONS && (
        <Box flexDirection="column" key={(renderData as { message: string }).message}>
          <Text>{(renderData as { message: string, options: string[] }).message}</Text>
          {/* Do not use the Select from @inkjs/ui. There is a crazy memory error that causes with no stack-trace */}
          <SelectInput items={
            (renderData as { message: string, options: string[] }).options.map((option) => ({
              label: option, value: option
            }))
          } onSelect={(value) => emitter.emit(RenderEvent.PROMPT_RESULT, structuredClone(value.value))}/>
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
    {
      renderStatus === RenderStatus.IMPORT_PROMPT_WARNING && (
        <ImportWarning emitter={emitter} renderData={renderData as any} />
      )
    }
    {
      renderStatus === RenderStatus.DISPLAY_INIT_BANNER && (
        <InitBanner emitter={emitter} />
      )
    }
    {
      renderStatus === RenderStatus.PROMPT_INIT_RESULT_SELECTION && (
        <Box flexDirection='column'>
          <Text>Codify found the following supported resorces on your system.</Text>
          <Text> </Text>
          <Text bold> Select which ones to import:</Text>
          <MultiSelect
            limit={9}
            items={(renderData as string[]).map((o) => ({ label: o, value: o })).sort((a, b) => a.label.localeCompare(b.label))}
            onSubmit={(result: unknown[]) => emitter.emit(RenderEvent.PROMPT_RESULT, result)}
            defaultSelected={(renderData as string[]).map((o) => ({ label: o, value: o }))}
          />
        </Box>
      )
    }
  </Box>
}
