import { Form, FormProps } from '@codifycli/ink-form';
import { Box, Static, Text, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import { useAtom } from 'jotai';
import { EventEmitter } from 'node:events';
import React, { useLayoutEffect } from 'react';

import { ApplyResult } from '../../entities/apply-result.js';
import { Plan, ResourcePlan } from '../../entities/plan.js';
import { prettyFormatResourcePlan } from '../plan-pretty-printer.js';
import { FileModificationResult } from '../../generators/index.js';
import { ImportResult } from '../../orchestrators/import.js';
import { RenderEvent } from '../reporters/reporter.js';
import { RenderStatus, store } from '../store/index.js';
import { FileModificationDisplay } from './file-modification/file-modification.js';
import { ImportResultComponent } from './import/import-result.js';
import { ImportWarning } from './import/import-warning.js';
import { InitBanner } from './init/InitBanner.js';
import { MultiSelect } from './multi-select/MultiSelect.js';
import { PlanComponent } from './plan/plan.js';
import { ProgressDisplay } from './progress/progress-display.js';
import { ApplyComplete } from './widgets/ApplyComplete.js';
import { PromptPressKeyToContinue } from './widgets/PromptPressKeyToContinue.js';
import { SudoPasswordInput } from './widgets/SudoPasswordInput.js';
import { TextInput } from './widgets/TextInput.js';

export function DefaultComponent(props: {
  emitter: EventEmitter
  onWriteReady?: (write: (data: string) => void) => void
}) {
  const { emitter, onWriteReady } = props
  const [{ status: renderStatus, data: renderData }] = useAtom(store.renderState);
  const { write } = useStdout();

  useLayoutEffect(() => {
    onWriteReady?.(write);
  }, []);

  return <Box flexDirection="column" marginTop={1}>
    {
      renderStatus === RenderStatus.DISPLAY_MESSAGE && (
        <Text>{renderData as string}</Text>
      )
    }
    {
      renderStatus === RenderStatus.APPLY_COMPLETE && (
        <Static items={[renderData as ApplyResult]}>{
          (result, idx) => <ApplyComplete key={idx} result={result} />
        }</Static>
      )
    }
    {
      renderStatus === RenderStatus.PROGRESS && (
        <ProgressDisplay emitter={emitter} />
      )
    }
    {
      renderStatus === RenderStatus.DISPLAY_PLAN && <Static items={[renderData as Plan]}>{
        (plan, idx) => <PlanComponent key={idx} plan={plan}/>
      }</Static>
    }
    {
      renderStatus === RenderStatus.PLUGIN_ERROR && (
        <Static items={[renderData as string[]]}>{
          (messages, idx) => (
            <Box key={idx} flexDirection="column" marginTop={1}>
              {messages.map((msg, i) => <Text key={i} color="red">{msg}</Text>)}
            </Box>
          )
        }</Static>
      )
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
        <SudoPasswordInput
          key={ (renderData as { attemptCount: number }).attemptCount}
          title={(renderData as { title?: string }).title}
          hasError={(renderData as { hasError: boolean }).hasError}
          cancellable={(renderData as { cancellable: boolean }).cancellable}
          onSubmit={(password) => emitter.emit(RenderEvent.SUDO_PROMPT_RESULT, password)}
          onCancel={() => emitter.emit(RenderEvent.SUDO_PASSWORD_CANCEL)}
        />
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
          <Text>Codify found the following supported resources on your system.</Text>
          <Text> </Text>
          <Text bold> Select resources to import:</Text>
          <MultiSelect
            defaultSelected={(renderData as string[]).map((o) => ({ label: o, value: o }))}
            items={(renderData as string[]).map((o) => ({ label: o, value: o })).sort((a, b) => a.label.localeCompare(b.label))}
            limit={9}
            onSubmit={(result: unknown[]) => emitter.emit(RenderEvent.PROMPT_RESULT, result.map((r: any) => r?.label))}
          />
        </Box>
      )
    }
    {
      renderStatus === RenderStatus.PROMPT_INPUT && (
        <Box flexDirection='column'>
          <Text bold>{(renderData as any).prompt}</Text>
          { (renderData as any).error && (<Text color='red'>{(renderData as any).error}</Text>) }
          <TextInput onSubmit={(result) => emitter.emit(RenderEvent.PROMPT_RESULT, result)} placeholder={(renderData as any).placeholder} />
        </Box>
      )
    }
    {
      renderStatus === RenderStatus.PROMPT_PRESS_KEY_TO_CONTINUE && (
        <PromptPressKeyToContinue message={renderData as string | undefined} onInput={() => emitter.emit(RenderEvent.PROMPT_RESULT)} />
      )
    }
  </Box>
}
