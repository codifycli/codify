import { CommandRequestData } from '@codifycli/schemas';
import cliCursor from 'cli-cursor';
import { render, type SuspendTerminal, type TerminalSuspension } from 'ink';
import { EventEmitter } from 'node:events';
import React from 'react';
import stripAnsi from 'strip-ansi'

import { PluginError } from '../../common/errors.js';
import { ApplyResult } from '../../entities/apply-result.js';
import { ResourceMissingParameters } from '../../entities/missing-parameter.js';
import { Plan, ResourcePlan } from '../../entities/plan.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { ctx, Event, ProcessName, SubProcessName, SubprocessFinishStatus } from '../../events/context.js';
import { FileModificationResult } from '../../generators/index.js';
import { ImportResult } from '../../orchestrators/import.js';
import { sleep } from '../../utils/index.js';
import { coerceParameterValue } from '../../utils/missing-parameters.js';
import { SudoUtils } from '../../utils/sudo.js';
import { DefaultComponent } from '../components/default-component.js';
import { StaticSinkContext } from '../components/static-output.js';
import { ParameterListProps } from '../components/parameter-list/parameter-list.js';
import { ProgressState, ProgressStatus } from '../components/progress/progress-display.js';
import { RenderStatus, store } from '../store/index.js';
import { PromptType, RenderEvent, Reporter } from './reporter.js';
import chalk from 'chalk';
import type { TemplateCommandApprovalRequest } from '../../templates/template-command-approval.js';
import { formatTemplateCommandApproval } from '../template-command-formatter.js';
import type { VariablePromptRequest } from '../../variables/variable-resolver.js';
import { formatVariableLabel } from '../variable-prompt-formatter.js';

const ProgressLabelMapping = {
  [ProcessName.TEST]: 'Codify test',
  [ProcessName.APPLY]: 'Codify apply',
  [ProcessName.PLAN]: 'Codify plan',
  [ProcessName.DESTROY]: 'Codify destroy',
  [ProcessName.REFRESH]: 'Codify refresh',
  [ProcessName.IMPORT]: 'Codify import',
  [ProcessName.INIT]: 'Codify init',
  [ProcessName.TERMINATE]: 'Attempting to terminate existing instance',
  [SubProcessName.APPLYING_RESOURCE]: 'Applying resource',
  [SubProcessName.GENERATE_PLAN]: 'Refresh states and generating plan',
  [SubProcessName.INITIALIZE_PLUGINS]: 'Initializing plugins',
  [SubProcessName.PARSE]: 'Parsing configs',
  [SubProcessName.CREATE_ROOT_FILE]: 'Creating root codify file',
  [SubProcessName.VALIDATE]: 'Validating configs',
  [SubProcessName.GET_REQUIRED_PARAMETERS]: 'Getting required parameters',
  [SubProcessName.IMPORT_RESOURCE]: 'Importing resource',
  [SubProcessName.FIND_EXISTING_RESOURCES]: 'Finding existing resources',
  [SubProcessName.TEST_INITIALIZE_AND_VALIDATE]: 'Initializing and validating your configs',
  [SubProcessName.TEST_CHECKING_VM_INSTALLED]: 'Checking if VM is installed',
  [SubProcessName.TEST_STARTING_VM]: 'Starting VM',
  [SubProcessName.TEST_COPYING_OVER_CONFIGS_AND_OPENING_TERMINAL]: 'Copying over configs and opening terminal (if a confirmation dialog appears within the VM, please confirm it.)',
  [SubProcessName.TEST_USER_CONTINUE_ON_VM]: 'Done setup! Please continue on the VM UI',
  [SubProcessName.TEST_DELETING_VM]: 'Deleting VM',
}

export class DefaultReporter implements Reporter {
  private renderEmitter = new EventEmitter();
  private inkWrite: ((data: string) => void) | null = null;
  private progressState: ProgressState | null = null
  private verbosityToggleCallback: (() => void) | null = null;
  private sudoPasswordSubmittedCallback: ((password: string) => Promise<boolean>) | null = null;
  private inkSuspendTerminal: SuspendTerminal | null = null;
  private terminalSuspension: TerminalSuspension | null = null;
  private ctxListeners: Array<[Event, (...args: any[]) => void]> = [];
  silent = false;
  rawOutput = false;

  /**
   * The reporter's UI when it is embedded in another Ink app (see `options.embedded`). Render it somewhere in the
   * host's tree; it stays empty until the reporter has something to show.
   */
  readonly element: React.ReactElement;

  /**
   * @param options.embedded Don't start an Ink app; the host renders `element` inside its own app instead.
   * @param options.onStaticOutput With `embedded`: receives permanent output (plan, apply result, ...) that would
   *   otherwise be printed through Ink's <Static>, which the host's app owns.
   */
  constructor(options?: { embedded?: boolean; onStaticOutput?: (node: React.ReactNode) => void }) {
    const component = <DefaultComponent
      emitter={this.renderEmitter}
      onSuspendTerminalReady={(suspendTerminal) => { this.inkSuspendTerminal = suspendTerminal; }}
      onWriteReady={(write) => { this.inkWrite = write; }}
    />;

    this.element = options?.onStaticOutput
      ? <StaticSinkContext.Provider value={options.onStaticOutput}>{component}</StaticSinkContext.Provider>
      : component;

    if (!options?.embedded) {
      render(this.element);
    }

    this.onCtx(Event.OUTPUT, (args) => this.log(args));
    this.onCtx(Event.PROCESS_START, (name) => this.onProcessStartEvent(name))
    this.onCtx(Event.PROCESS_FINISH, (name) => this.onProcessFinishEvent(name))
    this.onCtx(Event.SUB_PROCESS_START, (name, additionalName) => this.onSubprocessStartEvent(name, additionalName));
    this.onCtx(Event.SUB_PROCESS_FINISH, (name, additionalName, status) => this.onSubprocessFinishEvent(name, additionalName, status));

    this.renderEmitter.on(RenderEvent.TOGGLE_VERBOSITY, () => {
      this.verbosityToggleCallback?.();
    });

    this.renderEmitter.on(RenderEvent.SUDO_PASSWORD_TOGGLE, () => {
      this.handleInlineSudoPassword();
    });
  }

  /** Stop listening to the global event bus. Only needed by hosts that create more than one reporter per process. */
  dispose(): void {
    for (const [event, listener] of this.ctxListeners) {
      ctx.off(event, listener);
    }

    this.ctxListeners = [];
    this.renderEmitter.removeAllListeners();
  }

  private onCtx(event: Event, listener: (...args: any[]) => void): void {
    ctx.on(event, listener);
    this.ctxListeners.push([event, listener]);
  }

  onVerbosityToggle(callback: () => void): void {
    this.verbosityToggleCallback = callback;
  }

  onSudoPasswordSubmitted(callback: (password: string) => Promise<boolean>): void {
    this.sudoPasswordSubmittedCallback = callback;
  }

  setSudoPasswordCached(): void {
    store.set(store.isSudoPasswordCached, true);
  }

  setSleepPrevented(value: boolean): void {
    store.set(store.isSleepPrevented, value);
  }

  async promptPressKeyToContinue(message?: string): Promise<void> {
    const previousRenderState = this.getRenderState();

    await this.updateStateAndAwaitEvent<boolean>(
      () => this.updateRenderState(RenderStatus.PROMPT_PRESS_KEY_TO_CONTINUE, message),
      RenderEvent.PROMPT_RESULT,
    )

    await this.updateRenderState(previousRenderState.status, previousRenderState.data);
  }

  async displayInitBanner(skipConfirmation?: boolean): Promise<void> {
    if (skipConfirmation) {
      await this.updateRenderState(RenderStatus.DISPLAY_INIT_BANNER);
      return;
    }

    await this.updateStateAndAwaitEvent<boolean>(
      () => this.updateRenderState(RenderStatus.DISPLAY_INIT_BANNER),
      RenderEvent.PROMPT_RESULT,
    )
  }

  async promptVariable(request: VariablePromptRequest): Promise<unknown> {
    const previousRenderState = this.getRenderState();
    const value = await this.updateStateAndAwaitEvent<unknown>(
      () => this.updateRenderState(RenderStatus.PROMPT_VARIABLE, request),
      RenderEvent.PROMPT_RESULT,
    );

    await this.updateRenderState(previousRenderState.status, previousRenderState.data);
    ctx.log(`${formatVariableLabel(request)} -> ${request.sensitive ? '********' : JSON.stringify(value)}`);
    return value;
  }

  async promptInput(prompt: string, error?: string, placeholder?: string): Promise<string> {
    return this.updateStateAndAwaitEvent<string>(
      () => this.updateRenderState(RenderStatus.PROMPT_INPUT, { prompt, error, placeholder }),
      RenderEvent.PROMPT_RESULT,
    )
  }

  async displayProgress(): Promise<void> {
    await this.updateRenderState(RenderStatus.PROGRESS);
  }

  async hide(): Promise<void> {
    // Wait for the cleared frame to commit before the caller writes to stdout
    await this.setRenderStateAndWaitForCommit({ status: RenderStatus.NOTHING, data: null });
  }

  async setRawMode(): Promise<void> {
    this.rawOutput = true;
    // Hand the terminal to the PTY session (e.g. `gh auth login`): Ink flushes and erases its frame, stops
    // rendering, and fully releases stdin (raw mode off, 'readable' listener removed) until resumed.
    if (this.inkSuspendTerminal && !this.terminalSuspension) {
      this.terminalSuspension = await this.inkSuspendTerminal();
    }

    process.stdin.setRawMode(true);
    // Make sure the cursor is visible while we're waiting on stdin from the user.
    cliCursor.show(process.stdout);
  }

  async disableRawMode(): Promise<void> {
    this.rawOutput = false;
    process.stdin.setRawMode(false);

    // Wait for the terminal to settle before Ink takes it back.
    await sleep(200);

    // Ink re-enables raw mode for its own input hooks, re-hides the cursor and forces a full redraw
    const suspension = this.terminalSuspension;
    this.terminalSuspension = null;
    await suspension?.resume();
    await this.displayProgress();
  }

  async displayImportWarning(requiresParameters: string[], noParametersRequired: string[]): Promise<void> {
    await this.updateStateAndAwaitEvent<boolean>(
      () => this.updateRenderState(RenderStatus.IMPORT_PROMPT_WARNING, { requiresParameters, noParametersRequired }),
      RenderEvent.PROMPT_RESULT
    )
  }

  async promptUserForValues(resources: Array<ResourceInfo>, promptType: PromptType): Promise<ResourceConfig[]> {
    if (resources.length === 0) {
      return [];
    }

    const action = promptType === PromptType.DESTROY ? 'destroy' : 'import';
    const values = await this.promptParameterList({
      title: `Identify which instance to ${action}`,
      subtitle: `These resources can have multiple instances. Fill in the values that identify the one to ${action}.`,
      resources: resources.map((info) => {
        const sensitiveParameters = info.sensitiveParameters ?? [];
        return {
          id: info.type,
          config: { type: info.type },
          sensitiveKeys: sensitiveParameters,
          fields: info.getRequiredParameters().map((parameter) => ({
            path: [parameter.name],
            type: parameter.type ?? undefined,
            description: parameter.description,
            sensitive: sensitiveParameters.includes('*') || sensitiveParameters.includes(parameter.name),
            initialValue: toInputValue(parameter.value),
          })),
        };
      }),
    });

    // Values are flattened in the order of the resources and their parameters
    let offset = 0;
    return resources.map((info) => {
      const parameters = Object.fromEntries(info.getRequiredParameters().map((parameter) => [
        parameter.name,
        coerceParameterValue(values[offset++], parameter.type ?? undefined),
      ]));

      return ResourceConfig.fromJson({ core: { type: info.type }, parameters });
    });
  }

  async promptMissingParameters(requests: ResourceMissingParameters[]): Promise<unknown[][]> {
    if (requests.length === 0) {
      return [];
    }

    const values = await this.promptParameterList({
      title: 'Some values are missing from your config',
      subtitle: 'They are only used for this run and will not be saved to your config.',
      // Each resource is shown in full so the user has the context of what each value is for
      resources: requests.map(({ resource, parameters, sensitiveParameters }) => ({
        id: resource.id,
        config: { ...resource.core(), ...resource.parameters },
        sensitiveKeys: sensitiveParameters,
        fields: parameters.map((parameter) => ({
          path: parameter.path,
          type: parameter.type,
          itemsType: parameter.itemsType,
          description: parameter.description,
          sensitive: parameter.sensitive,
        })),
      })),
    });

    // Rows are flattened in request order. Reshape back into one list per resource.
    let offset = 0;
    return requests.map(({ parameters }) => {
      const resourceValues = values.slice(offset, offset + parameters.length);
      offset += parameters.length;
      return resourceValues;
    });
  }

  /** Shows the parameter list and resolves with one value per field (as typed). Throws if the user cancels. */
  private async promptParameterList(props: Omit<ParameterListProps, 'onCancel' | 'onSubmit'>): Promise<string[]> {
    const prevRenderState = this.getRenderState();

    const values = await this.updateStateAndAwaitEvent<null | string[]>(
      () => this.updateRenderState(RenderStatus.PROMPT_PARAMETER_LIST, props),
      RenderEvent.PROMPT_PARAMETER_LIST_RESULT,
    );

    await this.updateRenderState(prevRenderState.status, prevRenderState.data);

    if (values === null) {
      throw new Error('Cancelled: the values were not provided');
    }

    return values;
  }

  async displayImportResult(importResult: ImportResult, showConfigs: boolean): Promise<void> {
    store.set(store.progressState, null);
    this.progressState = null;

    await this.updateRenderState(RenderStatus.DISPLAY_IMPORT_RESULT, { importResult, showConfigs });
  }

  async promptSudo(pluginName: string, data: CommandRequestData): Promise<string | undefined> {
    ctx.log(`Plugin: "${pluginName}" requires root access to run command: "sudo ${data.command}"`);
    const title = `Plugin: "${pluginName}" requires root access to run command: "sudo ${data.command}"`;

    // Saving is only offered when a cache is registered (i.e. not in secure mode)
    const savable = this.sudoPasswordSubmittedCallback !== null;
    const result = await this.promptSudoPassword({ title, cancellable: false, savable });

    if (result?.save) {
      const isValid = await this.sudoPasswordSubmittedCallback!(result.password);
      if (isValid) {
        store.set(store.isSudoPasswordCached, true);
      }
    }

    await this.displayProgress();
    return result?.password;
  }

  async displayPlan(plan: Plan): Promise<void> {
    await this.updateRenderState(RenderStatus.DISPLAY_PLAN, plan);
  }

  async displayMessage(message: string) {
     await this.updateRenderState(RenderStatus.DISPLAY_MESSAGE, message);
  }

  async promptInitResultSelection(availableTypes: string[]): Promise<string[]> {
    return this.updateStateAndAwaitEvent(
      () => this.updateRenderState(RenderStatus.PROMPT_INIT_RESULT_SELECTION, availableTypes),
      RenderEvent.PROMPT_RESULT,
    )
  }

  async promptConfirmation(message: string): Promise<boolean> {
    const result = await this.updateStateAndAwaitEvent<boolean>(
      () => this.updateRenderState(RenderStatus.PROMPT_CONFIRMATION, message),
      RenderEvent.PROMPT_RESULT
    )

    ctx.log(result ? `${message} -> "Yes"` : `${message} -> "No"`)

    return result;
  }

  async promptTemplateCommandApproval(requests: TemplateCommandApprovalRequest[]): Promise<boolean> {
    const previousRenderState = this.getRenderState();
    const approved = await this.promptConfirmation(formatTemplateCommandApproval(requests));
    await this.updateRenderState(previousRenderState.status, previousRenderState.data);

    return approved;
  }

  async promptOptions(message:string, options:string[]): Promise<number> {
    const prevRenderState = this.getRenderState();

    const result = await this.updateStateAndAwaitEvent<string>(
      () => this.updateRenderState(RenderStatus.PROMPT_OPTIONS, { message, options }),
      RenderEvent.PROMPT_RESULT
    )

    ctx.log(`${message} -> "${result}"`)

    await this.updateRenderState(prevRenderState.status, prevRenderState.data);

    return options.indexOf(result);
  }

  async displayFileModifications(diff: Array<{ file: string; modification: FileModificationResult}>): Promise<void> {
    await this.updateRenderState(RenderStatus.DISPLAY_FILE_MODIFICATION, diff);
  }

  async displayApplyComplete(result: ApplyResult): Promise<void> {
    await this.updateRenderState(RenderStatus.APPLY_COMPLETE, result);
  }

  async displayPluginError(error: PluginError): Promise<void> {
    await this.updateRenderState(RenderStatus.PLUGIN_ERROR, [error.message]);
  }

  private log(log: string): void {
    if (this.silent) return;

    if (this.rawOutput) {
      // Bypass Ink entirely in raw mode — Ink's buffer can split or mangle OSC
      // escape sequences (e.g. \x1b]) that interactive tools like `gh auth login`
      // rely on for terminal capability probing.
      process.stdout.write(log);
    } else {
      this.inkWrite?.(chalk.cyan(stripAnsi(log)));
    }
  }

  private onProcessStartEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    this.progressState = {
      label: label + '...',
      name,
      status: ProgressStatus.IN_PROGRESS,
      subProgresses: [],
    };

    ctx.log(`${label} started`)
    store.set(store.progressState, this.progressState);
  }

  private onProcessFinishEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];
    ctx.log(`${label} finished successfully`)

    this.progressState!.status = ProgressStatus.FINISHED;
    store.set(store.progressState, structuredClone(this.progressState));
  }

  private onSubprocessStartEvent(name: SubProcessName, additionalName?: string): void {
    const label = ProgressLabelMapping[name] + (additionalName ? ' ' + additionalName : '');
    ctx.log(`${label} started`)

    this.progressState?.subProgresses?.push({
      label,
      name: name + (additionalName ?? ''),
      status: ProgressStatus.IN_PROGRESS,
    });
    store.set(store.progressState, structuredClone(this.progressState));
  }

  private onSubprocessFinishEvent(name: SubProcessName, additionalName?: string, status: SubprocessFinishStatus = SubprocessFinishStatus.SUCCESS): void {
    const label = ProgressLabelMapping[name] + (additionalName ? ' ' + additionalName : '');

    const subProgress = this.progressState
      ?.subProgresses
      ?.find((p) => p.name === name + (additionalName ?? ''));

    if (!subProgress) {
      return;
    }

    if (status === SubprocessFinishStatus.FAILED) {
      subProgress.status = ProgressStatus.FAILED;
      ctx.log(`${label} failed`);
    } else if (status === SubprocessFinishStatus.SKIPPED) {
      subProgress.status = ProgressStatus.SKIPPED;
      ctx.log(`${label} skipped`);
    } else {
      subProgress.status = ProgressStatus.FINISHED;
      ctx.log(`${label} finished successfully`);
    }

    store.set(store.progressState, structuredClone(this.progressState));
  }

  private async handleInlineSudoPassword(): Promise<void> {
    ctx.log('Prompting sudo to save password for rest of requests');
    const result = await this.promptSudoPassword({ cancellable: true, savable: false });

    if (result != null) {
      const isValid = await (this.sudoPasswordSubmittedCallback?.(result.password) ?? Promise.resolve(false));
      if (isValid) {
        store.set(store.isSudoPasswordCached, true);
      }
    }

    await this.displayProgress();
  }

  // Shared prompt loop for both inline (cancellable) and blocking (non-cancellable) sudo password entry.
  // Returns the validated password and whether the user chose to save it, or undefined if the user cancelled
  // (only possible when cancellable=true).
  private async promptSudoPassword(
    opts: { title?: string; cancellable: boolean; savable: boolean }
  ): Promise<{ password: string; save: boolean } | undefined> {
    const { title, cancellable, savable } = opts;
    let hasError = false;
    let attemptCount = 0;

    while (true) {
      attemptCount++;
      const result = (await Promise.all([
        this.updateRenderState(RenderStatus.SUDO_PROMPT, { attemptCount, hasError, cancellable, savable, title }),
        Promise.race([
          this.awaitEvent<{ password: string; save: boolean }>(RenderEvent.SUDO_PROMPT_RESULT),
          ...(cancellable
            ? [this.awaitEvent<'cancel'>(RenderEvent.SUDO_PASSWORD_CANCEL).then(() => Symbol.for('cancel'))]
            : []),
        ]),
      ])).at(1) as { password: string; save: boolean } | symbol;

      if (result === Symbol.for('cancel')) {
        return undefined;
      }

      const { password, save } = result as { password: string; save: boolean };
      const isValid = await SudoUtils.validate(password);

      if (isValid) {
        ctx.log('Sudo password successful!');
        await SudoUtils.invalidate();
        return { password, save };
      }

      hasError = true;
    }
  }

  private getRenderState(): { status: RenderStatus, data: any } {
    return store.get(store.renderState) as { status: RenderStatus, data: any };
  }

  /**
   * Update the render state. We need to make this async because there is currently a weird bug where if we switch the
   * layout too quickly then it can potentially crash with a memory error. We first switch to empty, wait 50ms and the
   * render the next state
   * @param status
   * @param data
   * @private
   */
  private async updateRenderState(status: RenderStatus | null, data?: unknown): Promise<void> {
    const current = this.getRenderState();
    if (current?.status !== status) {
      await this.setRenderStateAndWaitForCommit({ status: RenderStatus.NOTHING, data: null });
      await sleep(50);
    }

    await this.setRenderStateAndWaitForCommit({ status, data });
  }

  /**
   * Since React 19, updates coming from outside React (our jotai store) are no longer committed synchronously; React
   * schedules them for later. Callers often follow a display call with process.exit(), which unmounts Ink before a
   * pending update is ever rendered. So wait until DefaultComponent reports that the new state has been committed.
   * Once committed, Ink flushes the frame to stdout on exit. The timeout guards against waiting forever if Ink is not
   * rendering (e.g. it was never mounted).
   */
  private async setRenderStateAndWaitForCommit(state: { status: RenderStatus | null; data: unknown }): Promise<void> {
    const committed = new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.renderEmitter.off(RenderEvent.RENDER_STATE_COMMITTED, done);
        resolve();
      };

      const timer = setTimeout(done, 250);
      // React applies updates in order, so any commit after this point includes (or supersedes) this state
      this.renderEmitter.on(RenderEvent.RENDER_STATE_COMMITTED, done);
    });

    store.set(store.renderState, state);
    await committed;
  }

  // This is needed if we await any prompts. It makes the UI feel a lot more fluid since the await is no longer blocking
  private async updateStateAndAwaitEvent<T>(fn: () => void, eventName: string): Promise<T> {
    return (await Promise.all([
      fn(),
      this.awaitEvent(eventName)
    ])).at(1) as T;
  }

  private awaitEvent<T>(name: string): Promise<T> {
    return new Promise((resolve) => {
      this.renderEmitter.once(name, resolve)
    });
  }
}

/** Converts a pre-filled value (ex: from the existing config) into the text shown in the input */
function toInputValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.every((v) => ['boolean', 'number', 'string'].includes(typeof v))) {
    return value.join(', ');
  }

  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
