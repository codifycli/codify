import { CommandRequestData } from '@codifycli/schemas';

import { Plan } from '../../entities/plan.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ImportResult } from '../../orchestrators/import.js';
import { Reporter } from './reporter.js';

export class JsonReporter implements Reporter {
  silent = false;

  displayPlan(plan: Plan): void {
    console.log(JSON.stringify(plan.resources.map((r) => r.raw), null, 2));
  }

  promptPressKeyToContinue(message?: string): Promise<void> {
    throw new Error(`Press key to continue is not supported by the JsonReporter. 

 ${message}`)
  }

  async displayInitBanner(): Promise<void> {
  }

  async displayProgress(): Promise<void> {
  }

  async hide(): Promise<void> {
  }

  async promptInitResultSelection(availableTypes: string[]): Promise<string[]> {
    return availableTypes;
  }

  async promptInput(prompt: string): Promise<string> {
    throw new Error(`Json reporter error: user input is required for prompt: ${prompt}. The Json reporter doesn't support user input. Make sure to have parameters preconfigured`);
  }

  async promptConfirmation(): Promise<boolean> {
    return true;
  }

  async promptOptions(): Promise<number> {
    throw new Error('Json reporter error: this reporter does not support prompting options. Use another reporter.')
  }

  async promptSudo(pluginName: string, data: CommandRequestData): Promise<string | undefined> {
    throw new Error(`Json reporter error: sudo required for command: ${data.command}. Make sure to preconfigure the sudo password for the Json reporter using --sudoPassword`);
  }

  async promptUserForValues(): Promise<ResourceConfig[]> {
    throw new Error('Json reporter error: cannot prompt user for values while using Json reporter. Use a different reporter.');
  }

  async displayImportResult(importResult: ImportResult): Promise<void> {
    console.log(JSON.stringify(importResult.result.map((r) => r.raw)));
  }

  async displayFileModifications(): Promise<void> {
  }

  displayMessage(): void {
  }

  async displayImportWarning(): Promise<void> {
  }

  async setRawMode(): Promise<void> {
    throw new Error('Json reporter error: setRawMode is not supported. Raw stdin mode requires interactive terminal access.');
  }

  async disableRawMode(): Promise<void> {
    throw new Error('Json reporter error: disableRawMode is not supported. Raw stdin mode requires interactive terminal access.');
  }
}
