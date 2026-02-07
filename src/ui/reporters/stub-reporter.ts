import { CommandRequestData } from 'codify-schemas';

import { FileModificationResult } from '../../codify-files/generators/index.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { ImportResult } from '../../orchestrators/import.js';
import { PromptType, Reporter } from './reporter.js';

export class StubReporter implements Reporter {
    silent: boolean = true;
    displayPlan(): void {}
    async displayInitBanner(): Promise<void> {}
    async displayProgress(): Promise<void> {}
    async hide(): Promise<void> {}
    async promptAutoImportResultSelection(availableTypes: string[]): Promise<string[]> { return []; }
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
}
