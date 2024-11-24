import { SpawnStatus, SudoRequestData, SudoRequestResponseData } from 'codify-schemas';

import { Plan } from '../../../src/entities/plan.js';
import { ImportResult, RequiredProperties, UserSuppliedProperties } from '../../../src/orchestrators/import.js';
import { prettyFormatPlan } from '../../../src/ui/plan-pretty-printer.js';
import { Reporter } from '../../../src/ui/reporters/reporter.js';

export class MockReporter implements Reporter {
  displayApplyComplete(message: string[]): Promise<void> | void {
    console.log(JSON.stringify(message, null, 2));
  }
  
  displayPlan(plan: Plan): void {
    console.log(prettyFormatPlan(plan));
  }
  
  async promptApplyConfirmation(): Promise<boolean> {
    return true;
  }
  
  async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
    return {
      status: SpawnStatus.SUCCESS,
      data: '',
    }
  }

  async askRequiredPropertiesForImport(requiredParameters: RequiredProperties): Promise<UserSuppliedProperties> {
    const result = new Map<string, Record<string, string>>();

    for (const parameter of requiredParameters) {
      result.set(parameter[0], Object.fromEntries(parameter[1].map((p) => [p, ''])))
    }

    return result;
  }

  displayImportResult(importResult: ImportResult): void {
    console.log(JSON.stringify(importResult, null, 2));
  }
}
