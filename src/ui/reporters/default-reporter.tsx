import { PlanResponseData } from 'codify-schemas';
import { render } from 'ink';
import { EventEmitter } from 'node:events';
import React from 'react';

import { ctx, Event } from '../../events/context.js';
import { DefaultComponent } from '../components/default-component.js';
import { DisplayPlanStateTransition, RenderEvent, RenderState, Reporter } from './reporter.js';

export class DefaultReporter implements Reporter {

  private renderEmitter = new EventEmitter();
  private staticOutput = new Array<any>()

  constructor() {
    ctx.on(Event.OUTPUT, (...args) => this.renderLog(...args));
    ctx.on(Event.PROCESS_START, (name) => this.onProcessEvent(name))
    ctx.on(Event.PROCESS_FINISH, (name) => this.onProcessFinishEvent(name))
    ctx.on(Event.SUB_PROCESS_START, (name, processName) => this.onSubprocessStartEvent(name, processName));
    ctx.on(Event.SUB_PROCESS_FINISH, (name, processName) => this.onSubprocessFinishEvent(name, processName))

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

  private renderLog(...args: unknown[]) {
    this.staticOutput.push(...args);
    this.renderEmitter.emit(RenderEvent.LOG, this.staticOutput);
  }

  private onProcessEvent(name: string): void {
    this.processState.process.push({
      name,
      status: ProcessStatus.IN_PROGRESS,
      subprocess: [],
    })

    this.renderLog(`${name} started`)
    this.renderEmitter.emit(RenderEvent.PROCESS_UPDATE, this.processState);
  }

  private onProcessFinishEvent(name: string): void {
    const process = this.processState.process
      .find((process) => process.name === name);
    if (!process) {
      return;
    }

    process.status = ProcessStatus.FINISHED;

    this.renderLog(`${name} finished successfully`)
    this.renderEmitter.emit(RenderEvent.PROCESS_UPDATE, this.processState.process);

  }

  private onSubprocessStartEvent(name: string, processName: string): void {
    const process = this.processState.process
      .find((process) => process.name === processName);

    if (!process) return;

    process.subprocess.push({
      name,
      status: ProcessStatus.IN_PROGRESS,
    })

    this.renderLog(`${name} started`)
    this.renderEmitter.emit(RenderEvent.PROCESS_UPDATE, this.processState);
  }

  private onSubprocessFinishEvent(name: string, processName: string): void {
    const process = this.processState.process
      .find((process) => process.name === processName);
    if (!process) {
      return;
    }

    const subprocess = process.subprocess.find((subprocess) => subprocess.name === name)
    if (!subprocess) {
      return;
    }

    subprocess.status = ProcessStatus.FINISHED;

    this.renderLog(`${name} finished successfully`)
    this.renderEmitter.emit(RenderEvent.PROCESS_UPDATE, this.processState);
  }

}
