import chalk from 'chalk';
import { SudoRequestData, SudoRequestResponseData } from 'codify-schemas';
import { Box, Static, Text, render as inkRender } from 'ink';
import React from 'react';

import { Plan } from '../../entities/plan.js';
import { Event, ProcessName, SubProcessName, ctx } from '../../events/context.js';
import { ImportResult, RequiredProperties, UserSuppliedProperties } from '../../orchestrators/import.js';
import { BaseLayout } from '../components/base-layout.js';
import { ProgressDisplay, ProgressState, ProgressStatus } from '../components/progress/progress-display.js';
import { RenderEvent, Reporter } from './reporter.js';
import { PlanComponent } from '../components/plan/plan.js';
import { ImportParametersForm } from '../components/import/index.js';
import { ImportResultComponent } from '../components/import/import-result.js';
import { Select } from '@inkjs/ui';

enum RenderState {
  PROGRESS,
  DISPLAY_PLAN,
  IMPORT_PROMPT,
  APPLY_PROMPT,
  APPLY_COMPLETE,
  SUDO_PROMPT
}

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

interface AppProps {
}

interface AppState {
  renderState: RenderState;
  outputBuffer: string[];
  progress?: ProgressState;
  plan?: Plan;
}

class DefaultReporter2 extends React.Component<AppProps, AppState> implements Reporter {
  private readonly NUM_OUTPUT_LINES = 8;
  
  constructor(props: AppProps) {
    super(props);

    this.state = {
      renderState: RenderState.PROGRESS,
      outputBuffer: [],
    };
  }
  
  componentDidMount() {
    ctx.on(Event.OUTPUT, (args) => this.log(args));
    ctx.on(Event.PROCESS_START, (name) => this.onProcessStartEvent(name))
    ctx.on(Event.PROCESS_FINISH, (name) => this.onProcessFinishEvent(name))
    ctx.on(Event.SUB_PROCESS_START, (name, additionalName) => this.onSubprocessStartEvent(name, additionalName));
    ctx.on(Event.SUB_PROCESS_FINISH, (name, additionalName) => this.onSubprocessFinishEvent(name, additionalName))
  }

  displayApplyComplete(message: string[]): Promise<void> | void {
  }

  displayPlan(plan: Plan): void {
    this.setState({
      renderState: RenderState.DISPLAY_PLAN,
      plan
    })
  }
  
  async promptApplyConfirmation(): Promise<boolean> {
    return false;
  }
  
  async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
    throw new Error();
  }
  
  async askRequiredPropertiesForImport(requiredParameters: RequiredProperties): Promise<UserSuppliedProperties> {
    throw new Error();
  }
  
  displayImportResult(importResult: ImportResult): void {
  }
  
  log(data: string) {
    this.updateOutputDisplayBuffer(data);
    console.log(chalk.cyan(data));
  }
  
  render() {
    return (
      <Box>
        {
          this.state.renderState === RenderState.PROGRESS && (
            <Box>
              <ProgressDisplay progress={this.state.progress}/>
            </Box>
          )

        }
        {
          this.state.renderState === RenderState.DISPLAY_PLAN && this.state.plan && <Static items={[this.state.plan]}>{
            (plan, idx) => <PlanComponent key={idx} plan={plan}/>
          }</Static>
        }
        {
          this.state.renderState === RenderState.APPLY_PROMPT && (
            <Box flexDirection="column">
              <Text>Do you want to apply the above changes?</Text>
              <Select onChange={(value) => emitter.emit(RenderEvent.PROMPT_RESULT, value === 'yes')} options={[
                { label: 'Yes', value: 'yes' },
                { label: 'No', value: 'no' },
              ]}/>
            </Box>
          )
        }
        {
          this.state.renderState === RenderState.APPLY_COMPLETE && (
            <Box flexDirection="column">
              <Text> </Text>
              <Text>🎉 Finished applying 🎉</Text>
              <Text>Open a new terminal or source '.zshrc' for the new changes to be reflected</Text>
            </Box>
          )
        }
        {
          this.state.renderState === RenderState.SUDO_PROMPT && (
            <Box flexDirection="column">
              <Text>Password:</Text>
              {/* Use sudoAttemptCount as a hack to reset password input between attempts */}
              <PasswordInput key={sudoAttemptCount} onSubmit={(password) => {
                emitter.emit(RenderEvent.PROMPT_SUDO_RESULT, password);
              }}/>
            </Box>
          )
        }
        {
          showImportParametersPrompt && requiredPropertiesForImport && (
            <ImportParametersForm onSubmit={(result) => {
              emitter.emit(RenderEvent.PROMPT_IMPORT_PARAMETERS_RESULT, result)
            }} requiredProperties={requiredPropertiesForImport}/>
          )
        }
        {
          state === RenderState.DISPLAY_IMPORT_RESULT && importResult && (
            <Static items={[importResult]}>{
              (importResult, idx) => <ImportResultComponent importResult={importResult} key={idx} />
            }</Static>
          )
        }
      </Box>
    );
  }

  private onProcessStartEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    const progress = {
      label: label + '...',
      name,
      status: ProgressStatus.IN_PROGRESS,
      subProgresses: [],
    };

    this.setState({ progress });
    this.log(`${label} started`)
    
  }

  private onProcessFinishEvent(name: ProcessName): void {
    if (!this.state.progress) {
      return;
    }

    const label = ProgressLabelMapping[name];
    
    const progress = structuredClone(this.state.progress);
    progress.status = ProgressStatus.FINISHED;

    this.setState({ progress });
    this.log(`${label} finished successfully`)
  }

  private onSubprocessStartEvent(name: SubProcessName, additionalName?: string): void {
    if (!this.state.progress) {
      return;
    }

    console.log(name);

    const label = ProgressLabelMapping[name] + (additionalName
        ? ' ' + additionalName
        : ''
    );

    const progress = structuredClone(this.state.progress);
    progress.subProgresses?.push({
      label,
      name: name + (additionalName ?? ''),
      status: ProgressStatus.IN_PROGRESS,
    });

    this.setState({ progress });
    this.log(`${label} started`)
  }

  private onSubprocessFinishEvent(name: SubProcessName, additionalName?: string): void {
    if (!this.state.progress) {
      return;
    }

    const label = ProgressLabelMapping[name] + (additionalName
        ? ' ' + additionalName
        : ''
    );

    const progress = structuredClone(this.state.progress);

    const subProgress = progress
      ?.subProgresses
      ?.find((p) => p.name === name + (additionalName ?? ''));

    if (!subProgress) {
      return;
    }

    subProgress.status = ProgressStatus.FINISHED;

    this.setState({ progress });
    this.log(`${label} finished successfully`)
  }
  
  // On the default report we only show 8 lines of the latest logs.
  // Use a circular buffer to achieve this effect
  private updateOutputDisplayBuffer(data: string) {
    const newArr = [...this.state.outputBuffer]
    newArr.unshift(...data.toString().trim().split(/\n/));

    if (newArr.length > this.NUM_OUTPUT_LINES) {
      newArr.splice(this.NUM_OUTPUT_LINES, newArr.length - this.NUM_OUTPUT_LINES);
    }
    
    this.setState({ outputBuffer: newArr });
  }
}

export const DefaultReporterFactory = {
  createAndRender(): Reporter {
    const ref = React.createRef<DefaultReporter2>()
    const element = <DefaultReporter2 ref={ref}/>

    inkRender(element);
    return ref.current!;
  },
};
