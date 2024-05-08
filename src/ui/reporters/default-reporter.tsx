import { PlanResponseData } from 'codify-schemas';
import { render } from 'ink';
import { EventEmitter } from 'node:events';
import React from 'react';

import { ctx, Event, ProcessName, SubProcessName } from '../../events/context.js';
import { DefaultComponent } from '../components/default-component.js';
import { ProgressState, ProgressStatus } from '../components/progress/progress-display.js';
import { DisplayPlanStateTransition, RenderEvent, RenderState, Reporter } from './reporter.js';

const ProgressLabelMapping = {
  [ProcessName.APPLY]: 'Codify plan',
  [ProcessName.PLAN]: 'Codify plan',
  [SubProcessName.APPLY_RESOURCE]: 'Applying resource',
  [SubProcessName.GENERATE_PLAN]: 'Refresh states and generating plan',
  [SubProcessName.INITIALIZE_PLUGINS]: 'Initializing plugins',
  [SubProcessName.PARSE]: 'Parsing configs',
  [SubProcessName.VALIDATE]: 'Validating configs',
}

export class DefaultReporter implements Reporter {

  private renderEmitter = new EventEmitter();
  private progressState: ProgressState | null = null

  constructor() {
    render(<DefaultComponent emitter={this.renderEmitter}/>)

    ctx.on(Event.OUTPUT, (args) => this.log(args));
    ctx.on(Event.PROCESS_START, (name) => this.onProcessStartEvent(name))
    ctx.on(Event.PROCESS_FINISH, (name) => this.onProcessFinishEvent(name))
    ctx.on(Event.SUB_PROCESS_START, (name) => this.onSubprocessStartEvent(name));
    ctx.on(Event.SUB_PROCESS_FINISH, (name) => this.onSubprocessFinishEvent(name))
  }

  displayPlan(plan: PlanResponseData[]): void {
    this.progressState = null;

    this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
      nextState: RenderState.DISPLAY_PLAN,
      plan,
    } as DisplayPlanStateTransition);
  }

  async promptApplyConfirmation(): Promise<boolean> {
    const result = await Promise.all([
      new Promise<boolean>((resolve) => {
        this.renderEmitter.once(RenderEvent.PROMPT_RESULT, (isConfirmed) => resolve(isConfirmed as boolean));
      }),
      this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
        nextState: RenderState.PROMPT_APPLY_CONFIRMATION,
      }),
    ])

    const continueApply = result[0];

    if (continueApply) {
      this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
        nextState: RenderState.APPLYING,
      });
    }

    this.log(`Do you want to apply the above changes? -> ${continueApply ? '"Yes"' : '"No"'}`)
    return continueApply;
  }

  private log(args: string): void {
    this.renderEmitter.emit(RenderEvent.LOG, args);
  }

  private onProcessStartEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    this.progressState = {
      label: label + '...',
      name,
      status: ProgressStatus.IN_PROGRESS,
      subProgresses: [],
    };

    this.log(`${label} started`)
    this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);
  }

  private onProcessFinishEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    this.progressState!.status = ProgressStatus.FINISHED;

    this.log(`${label} finished successfully`)
    this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);

  }

  private onSubprocessStartEvent(name: SubProcessName): void {
    const label = ProgressLabelMapping[name];

    this.progressState?.subProgresses?.push({
      label,
      name,
      status: ProgressStatus.IN_PROGRESS,
    });

    this.log(`${label} started`)
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

    this.log(`${label} finished successfully`)
    this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);
  }

}
