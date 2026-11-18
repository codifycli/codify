import { CommandRequestData } from '@codifycli/schemas';

import { PluginError } from '../../common/errors.js';
import { ApplyResult } from '../../entities/apply-result.js';
import { ResourceMissingParameters } from '../../entities/missing-parameter.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { FileModificationResult } from '../../generators/index.js';
import { ImportResult } from '../../orchestrators/import.js';
import type { TemplateCommandApprovalRequest } from '../../templates/template-command-approval.js';
import type { VariablePromptRequest } from '../../variables/variable-resolver.js';
import { PromptType, Reporter } from './reporter.js';

export class StubReporter implements Reporter {
    silent: boolean = true;
    async displayPlan(): Promise<void> {}
    async displayInitBanner(_skipConfirmation?: boolean): Promise<void> {}
    async displayProgress(): Promise<void> {}
    async hide(): Promise<void> {}
    async promptInitResultSelection(availableTypes: string[]): Promise<string[]> { return []; }
    async promptInput(prompt: string): Promise<string> { throw new Error('Method not implemented.'); }
    async promptConfirmation(message: string): Promise<boolean> { return true; }
    // Commands from templates are never approved without an explicit answer
    async promptTemplateCommandApproval(_requests: TemplateCommandApprovalRequest[]): Promise<boolean> { return false; }
    async promptOptions(message: string, options: string[]): Promise<number> { throw new Error('Method not implemented.'); }
    async promptSudo(pluginName: string, data: CommandRequestData): Promise<string | undefined> { throw new Error('Method not implemented.'); }
    async promptMissingParameters(requests: ResourceMissingParameters[]): Promise<unknown[][]> { throw new Error('Method not implemented.'); }
    // Uses the default. Variables without a default can't be asked
    async promptVariable(request: VariablePromptRequest): Promise<unknown> {
      if (request.default !== undefined && !request.error) return undefined;
      throw new Error(`The variable "${request.name}" needs a value`);
    }
    async promptUserForValues(resources: Array<ResourceInfo>, promptType: PromptType): Promise<ResourceConfig[]> { throw new Error('Method not implemented.'); }
    async promptPressKeyToContinue(message?: string): Promise<void> {}
    async displayImportResult(importResult: ImportResult): Promise<void> {}
    async displayFileModifications(diff: Array<{ file: string, modification: FileModificationResult }>): Promise<void> {}
    async displayMessage(message: string): Promise<void> {}
    async displayImportWarning(requiresParameters: string[], noParametersRequired: string[]): Promise<void> {}
    async setRawMode(): Promise<void> {}
    async disableRawMode(): Promise<void> {}
    async displayPluginError(_error: PluginError): Promise<void> {}
    async displayApplyComplete(_result: ApplyResult): Promise<void> {}
}
