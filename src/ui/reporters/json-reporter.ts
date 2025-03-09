import { SudoRequestData, SudoRequestResponseData } from 'codify-schemas';

import { Plan } from '../../entities/plan.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { ImportResult } from '../../orchestrators/import.js';
import { FileModificationResult } from '../../utils/file-modification-calculator.js';
import { PromptType, Reporter } from './reporter.js';

export class JsonReporter implements Reporter {
    displayPlan(plan: Plan): void {
      console.log(JSON.stringify(plan.resources.map((r) => r.raw), null, 2));
    }

    async displayInitBanner(): Promise<void> {}

    async displayProgress(): Promise<void> {}

    async hide(): Promise<void> {}

    async promptInitResultSelection(availableTypes: string[]): Promise<string[]> {
      return availableTypes;
    }
    
    async promptInput(prompt: string, error?: string | undefined, validation?: (() => Promise<boolean>) | undefined, autoComplete?: ((input: string) => string[]) | undefined): Promise<string> {
      throw new Error(`Json reporter error: user input is required for prompt: ${prompt}. The Json reporter doesn't support user input. Make sure to have parameters preconfigured`);
    }
    
    async promptConfirmation(message: string): Promise<boolean> {
      return true;
    }
    
    async promptOptions(message: string, options: string[]): Promise<number> {
      throw new Error('Json reporter error: this reporter does not support prompting options. Use another reporter.')
    }
    
    async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
      throw new Error(`Json reporter error: sudo required for command: ${data.command}. Make sure to preconfigure the sudo password for the Json reporter using --sudoPassword`);
    }
    
    async promptUserForValues(resources: ResourceInfo[], promptType: PromptType): Promise<ResourceConfig[]> {
      throw new Error('Json reporter error: cannot prompt user for values while using Json reporter. Use a different reporter.');
    }
    
    async displayImportResult(importResult: ImportResult, showConfigs: boolean): void {
      console.log(JSON.stringify(importResult.result.map((r) => r.raw)));
    }
    
    async displayFileModifications(diff: { file: string; modification: FileModificationResult; }[]): void {}
    
    displayMessage(message: string): void {}
  
    async displayImportWarning(requiresParameters: string[], noParametersRequired: string[]): Promise<void> {}
}
