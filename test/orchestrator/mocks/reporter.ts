import { SpawnStatus, SudoRequestData, SudoRequestResponseData } from 'codify-schemas';

import { Plan } from '../../../src/entities/plan.js';
import { ResourceConfig } from '../../../src/entities/resource-config.js';
import { ResourceInfo } from '../../../src/entities/resource-info.js';
import { ImportResult } from '../../../src/orchestrators/import.js';
import { prettyFormatPlan } from '../../../src/ui/plan-pretty-printer.js';
import { PromptType, Reporter } from '../../../src/ui/reporters/reporter.js';
import { FileModificationResult } from '../../../src/utils/file-modification-calculator.js';

export interface MockReporterConfig {
  validatePlan?: (plan: Plan) => Promise<void> | void;
  validateMessage?: (message: string) => Promise<void> | void;
  validateImport?: (result: ImportResult) => Promise<void> | void;
  promptConfirmation?: () => boolean;
  promptOptions?: (message: string, options: string[]) => number;
  promptUserForValues?: (resourceInfo: ResourceInfo[]) => Promise<ResourceConfig[]> | ResourceConfig[];
  displayImportResult?: (importResult: ImportResult, showConfigs: boolean) => Promise<void> | void;
  displayFileModifications?: (diff: { file: string; modification: FileModificationResult; }[]) => void,
  displayImportWarning?: (requiresParameters: string[], noParametersRequired: string[]) => void
}

export class MockReporter implements Reporter {
  private config: MockReporterConfig | null;

  constructor(config?: MockReporterConfig) {
    this.config = config ?? null;
  }

  async displayImportWarning(requiresParameters: string[], noParametersRequired: string[]): Promise<void> {
    console.log('Display import warning');
    console.log(requiresParameters);
    console.log(noParametersRequired);

    this.config?.displayImportWarning?.(requiresParameters, noParametersRequired);
  }

  async promptOptions(message: string, options: string[]): Promise<number> {
    return this.config?.promptOptions?.(message, options) ?? 0;
  }

  async displayFileModifications(diff: { file: string; modification: FileModificationResult; }[]): Promise<void> {
    this.config?.displayFileModifications?.(diff);
  }

  async displayMessage(message: string): Promise<void> {
    console.log(JSON.stringify(message, null, 2));
    await this.config?.validateMessage?.(message);
  }
  
  async displayPlan(plan: Plan): Promise<void> {
    console.log(prettyFormatPlan(plan));
    await this.config?.validatePlan?.(plan);
  }
  
  async promptConfirmation(): Promise<boolean> {
    return this.config?.promptConfirmation?.() ?? true;
  }
  
  async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
    return {
      status: SpawnStatus.SUCCESS,
      data: '',
    }
  }

  async promptUserForValues(resourceInfo: ResourceInfo[], promptType: PromptType): Promise<ResourceConfig[]> {
    if (this.config?.promptUserForValues) {
      return this.config.promptUserForValues(resourceInfo);
    }

    return resourceInfo.map((i) => new ResourceConfig({ type: i.type }))
  }

  displayImportResult(importResult: ImportResult, showConfigs: boolean): void {
    this.config?.displayImportResult?.(importResult, showConfigs);
  }
}
