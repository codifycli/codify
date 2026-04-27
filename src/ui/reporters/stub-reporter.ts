import { CommandRequestData } from '@codifycli/schemas';

import { PluginError } from '../../common/errors.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { FileModificationResult } from '../../generators/index.js';
import { ImportResult } from '../../orchestrators/import.js';
import { PromptType, Reporter } from './reporter.js';

export class StubReporter implements Reporter {
    silent: boolean = true;
    async displayPlan(): Promise<void> {}
    async displayInitBanner(): Promise<void> {}
    async displayProgress(): Promise<void> {}
    async hide(): Promise<void> {}
    async promptInitResultSelection(availableTypes: string[]): Promise<string[]> { return []; }
    async promptInput(prompt: string): Promise<string> { throw new Error('Method not implemented.'); }
    async promptConfirmation(message: string): Promise<boolean> { return true; }
    async promptOptions(message: string, options: string[]): Promise<number> { throw new Error('Method not implemented.'); }
    async promptSudo(pluginName: string, data: CommandRequestData): Promise<string | undefined> { throw new Error('Method not implemented.'); }
    async promptUserForValues(resources: Array<ResourceInfo>, promptType: PromptType): Promise<ResourceConfig[]> { throw new Error('Method not implemented.'); }
    async promptPressKeyToContinue(message?: string): Promise<void> {}
    async displayImportResult(importResult: ImportResult): Promise<void> {}
    async displayFileModifications(diff: Array<{ file: string, modification: FileModificationResult }>): Promise<void> {}
    async displayMessage(message: string): Promise<void> {}
    async displayImportWarning(requiresParameters: string[], noParametersRequired: string[]): Promise<void> {}
    async setRawMode(): Promise<void> {}
    async disableRawMode(): Promise<void> {}
    async displayPluginError(_errors: PluginError[]): Promise<void> {}
}
