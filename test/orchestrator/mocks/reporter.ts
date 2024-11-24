import { SpawnStatus, SudoRequestData, SudoRequestResponseData } from 'codify-schemas';

import { Plan } from '../../../src/entities/plan.js';
import { ImportResult, RequiredProperties, UserSuppliedProperties } from '../../../src/orchestrators/import.js';
import { prettyFormatPlan } from '../../../src/ui/plan-pretty-printer.js';
import { Reporter } from '../../../src/ui/reporters/reporter.js';

export interface MockReporterConfig {
  validatePlan?: (plan: Plan) => Promise<void> | void;
  validateApplyComplete?: (message: string[]) => Promise<void> | void;
  validateImport?: (result: ImportResult) => Promise<void> | void;
  promptApplyConfirmation?: () => boolean;
  askRequiredPropertiesForImport?: (requiredParameters: RequiredProperties) => Promise<UserSuppliedProperties> | UserSuppliedProperties;
}

export class MockReporter implements Reporter {
  private config: MockReporterConfig | null;

  constructor(config?: MockReporterConfig) {
    this.config = config ?? null;
  }

  async displayApplyComplete(message: string[]): Promise<void> {
    console.log(JSON.stringify(message, null, 2));
    await this.config?.validateApplyComplete?.(message);
  }
  
  async displayPlan(plan: Plan): Promise<void> {
    console.log(prettyFormatPlan(plan));
    await this.config?.validatePlan?.(plan);
  }
  
  async promptApplyConfirmation(): Promise<boolean> {
    return this.config?.promptApplyConfirmation?.() ?? true;
  }
  
  async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
    return {
      status: SpawnStatus.SUCCESS,
      data: '',
    }
  }

  async askRequiredPropertiesForImport(requiredParameters: RequiredProperties): Promise<UserSuppliedProperties> {
    if (this.config?.askRequiredPropertiesForImport) {
      return this.config.askRequiredPropertiesForImport(requiredParameters);
    }

    const result = new Map<string, Record<string, string>>();

    for (const parameter of requiredParameters) {
      result.set(parameter[0], Object.fromEntries(parameter[1].map((p) => [p, ''])))
    }

    return result;
  }

  displayImportResult(importResult: ImportResult): void {
    console.log(JSON.stringify(importResult, null, 2));
    this.config?.validateImport?.(importResult);
  }
}
