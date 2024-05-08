import { PlanResponseData } from 'codify-schemas';
import { render } from 'ink';
import { EventEmitter } from 'node:events';
import React from 'react';

import { ctx, Event, ProcessName, SubProcessName } from '../../events/context.js';
import { DefaultComponent } from '../components/default-component.js';
import { ProgressState, ProgressStatus } from '../components/progress/progress-display.js';
import { DisplayPlanStateTransition, RenderEvent, RenderState, Reporter } from './reporter.js';

const ProgressLabelMapping = {
  [ProcessName.APPLY]: 'Applying plan...',
  [ProcessName.PLAN]: 'Generating plan...',
  [SubProcessName.APPLY_RESOURCE]: 'Applying resource',
  [SubProcessName.GENERATE_PLAN]: 'Generating plan',
  [SubProcessName.INITIALIZE_PLUGINS]: 'Initializing plugins',
  [SubProcessName.PARSE]: 'Parsing configs',
  [SubProcessName.VALIDATE]: 'Validating configs',
}

export class DefaultReporter implements Reporter {

  private renderEmitter = new EventEmitter();
  private staticOutput = new Array<string>()
  private progressState: ProgressState | null = null

  constructor() {
    ctx.on(Event.OUTPUT, (...args) => this.renderLog(...args));
    ctx.on(Event.PROCESS_START, (name) => this.onProcessStartEvent(name))
    ctx.on(Event.PROCESS_FINISH, (name) => this.onProcessFinishEvent(name))
    ctx.on(Event.SUB_PROCESS_START, (name) => this.onSubprocessStartEvent(name));
    ctx.on(Event.SUB_PROCESS_FINISH, (name) => this.onSubprocessFinishEvent(name))

    render(<DefaultComponent emitter={this.renderEmitter}/>)
  }

  async promptConfirmation(): Promise<boolean> {
    const result = await Promise.all([
      new Promise<boolean>((resolve) => {
        this.renderEmitter.once(RenderEvent.PROMPT_RESULT, (isConfirmed) => resolve(isConfirmed as boolean));
      }),
      this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
        nextState: RenderState.ASK_CONFIRMATION,
      }),
    ])


    return result[0];
  }

  displayPlan(plan: PlanResponseData[]): void {
    this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
      nextState: RenderState.DISPLAY_PLAN,
      plan,
    } as DisplayPlanStateTransition);
  }

  private renderLog(...args: string[]) {
    this.staticOutput.push(...args);
    this.renderEmitter.emit(RenderEvent.LOG, this.staticOutput);
  }

  private onProcessStartEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    this.progressState = {
      name,
      label,
      status: ProgressStatus.IN_PROGRESS,
      subProgresses: [],
    };

    this.renderLog(`${label} started`)
    this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);
  }

  private onProcessFinishEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    this.progressState!.status = ProgressStatus.FINISHED;

    this.renderLog(`${label} finished successfully`)
    this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);

  }

  private onSubprocessStartEvent(name: SubProcessName): void {
    const label = ProgressLabelMapping[name];

    this.progressState?.subProgresses?.push({
      name,
      label,
      status: ProgressStatus.IN_PROGRESS,
    });

    this.renderLog(`${label} started`)
    this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);
  }

  private onSubprocessFinishEvent(name: SubProcessName): void {
    const label = ProgressLabelMapping[name];

    const subProgress = this.progressState
      ?.subProgresses
      ?.find((p) => p.name === name);

    if (!subProgress) {
      return;
    }

    subProgress.status = ProgressStatus.FINISHED;

    this.renderLog(`${label} finished successfully`)
    this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);
  }

}
