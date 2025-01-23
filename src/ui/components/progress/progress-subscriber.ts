// Subscribes to the global ctx event bus and translates
import { ctx, Event, ProcessName, SubProcessName } from '../../../events/context.js';
import { ProgressStatus } from './ProgressDisplay.js';

const ProgressLabelMapping = {
  [ProcessName.APPLY]: 'Codify apply',
  [ProcessName.PLAN]: 'Codify plan',
  [ProcessName.DESTROY]: 'Codify destroy',
  [ProcessName.IMPORT]: 'Codify import',
  [SubProcessName.APPLYING_RESOURCE]: 'Applying resource',
  [SubProcessName.GENERATE_PLAN]: 'Refresh states and generating plan',
  [SubProcessName.INITIALIZE_PLUGINS]: 'Initializing plugins',
  [SubProcessName.PARSE]: 'Parsing configs',
  [SubProcessName.VALIDATE]: 'Validating configs',
  [SubProcessName.GET_REQUIRED_PARAMETERS]: 'Getting required parameters',
  [SubProcessName.IMPORT_RESOURCE]: 'Importing resource'
}

enum ProgressStatus {
  IN_PROGRESS,
  FINISHED,
}

export interface ProgressState {
  name: string,
  label: string;
  status: ProgressStatus;
  subProgresses: Array<{
    name: string,
    label: string;
    status: ProgressStatus;
  }> | null;
}

export class DefaultReporterProgressSubscriber {
  private listeners: Array<(newState: ProgressState | null, eventType: Event) => void> = [];
  private state: ProgressState | null = null;

  constructor() {
    ctx.on(Event.PROCESS_START, (name) => this.onProcessStartEvent(name))
    ctx.on(Event.PROCESS_FINISH, (name) => this.onProcessFinishEvent(name))
    ctx.on(Event.SUB_PROCESS_START, (name, additionalName) => this.onSubprocessStartEvent(name, additionalName));
    ctx.on(Event.SUB_PROCESS_FINISH, (name, additionalName) => this.onSubprocessFinishEvent(name, additionalName))
  }

  onUpdate(fn: (newState: ProgressState | null, eventType: Event) => void) {
    this.listeners.push(fn);
  }

  private flushUpdate(eventType: Event) {
    this.state = structuredClone(this.state);
    this.listeners.forEach((listener) => listener(this.state, eventType));
  }

  private onProcessStartEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    // log(`${label} started`)
    this.state = {
      label: label + '...',
        name,
        status: ProgressStatus.IN_PROGRESS,
      subProgresses: [],
    }
    this.flushUpdate(Event.PROCESS_START);
  }

  private onProcessFinishEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    // log(`${label} finished successfully`)
    this.state!.status = ProgressStatus.FINISHED;
    this.flushUpdate(Event.PROCESS_FINISH)
  }

  private onSubprocessStartEvent(name: SubProcessName, additionalName?: string): void {
    const label = ProgressLabelMapping[name] + (additionalName
        ? ' ' + additionalName
        : ''
    );

    // log(`${label} started`)

    this.state?.subProgresses?.push({
      label,
      name: name + additionalName,
      status: ProgressStatus.IN_PROGRESS,
    })

    this.flushUpdate(Event.SUB_PROCESS_START);
  }

  private onSubprocessFinishEvent(name: SubProcessName, additionalName?: string): void {
    const label = ProgressLabelMapping[name] + (additionalName
        ? ' ' + additionalName
        : ''
    );

    const subProgress = this.state
      ?.subProgresses
      ?.find((p) => p.name === name + additionalName);

    if (!subProgress) {
      return;
    }

    subProgress.status = ProgressStatus.FINISHED;

    this.flushUpdate(Event.SUB_PROCESS_FINISH);

    // log(`${label} finished successfully`)
  }
}
