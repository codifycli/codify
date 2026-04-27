import { Form, FormProps } from '@codifycli/ink-form';
import { Box, Static, Text, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import { useAtom } from 'jotai';
import { EventEmitter } from 'node:events';
import React, { useLayoutEffect } from 'react';

import { ResourceOperation } from '@codifycli/schemas';

import { ApplyResult, ApplyResultEntry } from '../../entities/apply-result.js';
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
import { PromptPressKeyToContinue } from './widgets/PromptPressKeyToContinue.js';
import { SudoPasswordInput } from './widgets/SudoPasswordInput.js';
import { TextInput } from './widgets/TextInput.js';

function entryLabel(entry: ApplyResultEntry): string {
  if (entry.status === 'failed') return 'failed';
  if (entry.status === 'skipped') return 'skipped';
  switch (entry.operation) {
    case ResourceOperation.CREATE: return 'installed';
    case ResourceOperation.DESTROY: return 'destroyed';
    case ResourceOperation.MODIFY:
    case ResourceOperation.RECREATE: return 'modified';
    default: return 'applied';
  }
}

function entryColor(entry: ApplyResultEntry): string {
  if (entry.status === 'failed') return 'red';
  if (entry.status === 'skipped') return 'gray';
  switch (entry.operation) {
    case ResourceOperation.CREATE: return 'green';
    case ResourceOperation.DESTROY: return 'red';
    case ResourceOperation.MODIFY:
    case ResourceOperation.RECREATE: return '#d4a017';
    default: return 'white';
  }
}

function ApplyCompleteComponent({ result }: { result: ApplyResult }) {
  const isPartial = result.isPartialFailure();
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={isPartial ? 'red' : 'green'}>
        {isPartial ? '⚠ Apply completed with errors' : '🎉 Finished applying 🎉'}
      </Text>
      {result.entries.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {result.entries.map((entry) => (
            <Box key={entry.id}>
              <Text>{entry.id.padEnd(30)}</Text>
              <Text color={entryColor(entry)}>{entryLabel(entry)}</Text>
            </Box>
          ))}
        </Box>
      )}
      {!isPartial && (
        <Box marginTop={1}>
          <Text dimColor>Open a new terminal or source &apos;.zshrc&apos; for the new changes to be reflected</Text>
        </Box>
      )}
    </Box>
  );
}

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
          (result, idx) => <ApplyCompleteComponent key={idx} result={result} />
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
      renderStatus === RenderStatus.APPLY_VALIDATION_ERROR && (
        <Static items={[renderData as ResourcePlan[]]}>{
          (resourcePlans, idx) => (
            <Box key={idx} flexDirection="column" marginTop={1}>
              {resourcePlans.map((resourcePlan) => (
                <Box key={resourcePlan.id} flexDirection="column">
                  <Text color="red" bold>
                    {`Apply failed: resource "${resourcePlan.id}" did not reach its desired state.`}
                  </Text>
                  <Text> </Text>
                  <Text bold backgroundColor={'red'}>Changes still needed:</Text>
                  <Text>{prettyFormatResourcePlan(resourcePlan)}</Text>
                  <Text> </Text>
                </Box>
              ))}
              <Text color="red" bold>Exiting...</Text>
              <Text> </Text>
              <Text color="red" bold>Potential fixes:</Text>
              <Text color="red" bold>{'  1. Re-run the command again'}</Text>
              <Text color="red" bold>{'  2. Manually install the resource and retry'}</Text>
              <Text color="red" bold>{'  3. Reach out to support at https://github.com/codifycli/default-plugin/issues'}</Text>
            </Box>
          )
        }</Static>
      )
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
