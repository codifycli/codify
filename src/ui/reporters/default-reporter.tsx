import { PlanResponseData } from 'codify-schemas';
import { render } from 'ink';
import { EventEmitter } from 'node:events';
import React from 'react';

import { ctx, Event } from '../../events/context.js';
import { DefaultComponent } from '../components/default-component.js';
import { Reporter } from './reporter.js';

export enum ProcessStatus {
  NOT_STARTED,
  IN_PROGRESS,
  FINISHED,
}

export interface ProcessState {
  process: Array<{
    name: string;
    status: ProcessStatus;
    subprocess: Array<{
      name: string;
      status: ProcessStatus;
    }>
  }>
}

export class DefaultReporter implements Reporter {

  private renderEmitter = new EventEmitter();
  private staticOutput = new Array<any>()
  private processState = {
    process: [],
  } as ProcessState

  constructor() {
    ctx.on(Event.OUTPUT, (...args) => this.onOutputEvent(...args));
    ctx.on(Event.PROCESS_START, (name) => this.onProcessStartEvent(name))
    ctx.on(Event.PROCESS_FINISH, (name) => this.onProcessFinishEvent(name))
    ctx.on(Event.SUB_PROCESS_START, (name, processName) => this.onSubprocessStartEvent(name, processName));
    ctx.on(Event.SUB_PROCESS_FINISH, (name, processName) => this.onSubprocessFinishEvent(name, processName))

    render(<DefaultComponent emitter={this.renderEmitter}/>)

  }

  async promptConfirmation(): Promise<boolean> {
    return true;
  }

  displayPlan(plan: PlanResponseData[]): void {
    this.renderEmitter.emit('process', []);
    this.renderEmitter.emit('plan', plan);
  }

  private onOutputEvent(...args: unknown[]) {
    this.staticOutput.push(...args)
    this.renderEmitter.emit('static_output', this.staticOutput);
  }

  private onProcessStartEvent(name: string): void {
    this.processState.process.push({
      name,
      status: ProcessStatus.IN_PROGRESS,
      subprocess: [],
    })

    this.onOutputEvent(`${name} started`)
    this.renderEmitter.emit('process', this.processState);
  }

  private onProcessFinishEvent(name: string): void {
    const process = this.processState.process
      .find((process) => process.name === name);
    if (!process) {
      return;
    }

    process.status = ProcessStatus.FINISHED;

    this.onOutputEvent(`${name} finished successfully`)
    this.renderEmitter.emit('process', this.processState.process);

  }

  private onSubprocessStartEvent(name: string, processName: string): void {
    const process = this.processState.process
      .find((process) => process.name === processName);

    if (!process) return;

    process.subprocess.push({
      name,
      status: ProcessStatus.IN_PROGRESS,
    })

    this.onOutputEvent(`${name} started`)
    this.renderEmitter.emit('process', this.processState);
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

    this.onOutputEvent(`${name} finished successfully`)
    this.renderEmitter.emit('process', this.processState);
  }

}
