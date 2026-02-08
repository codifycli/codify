import { CommandRequestData } from 'codify-schemas';

import { Plan } from '../../entities/plan.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { FileModificationResult } from '../../generators/index.js';
import { ImportResult } from '../../orchestrators/import.js';
import { PromptType, Reporter } from './reporter.js';

/**
 * MCP Reporter - A specialized reporter for Model Context Protocol communication
 * This reporter suppresses interactive prompts and UI rendering, instead collecting
 * data for JSON serialization back to the MCP client.
 */
export class McpReporter implements Reporter {
  silent = true;

  displayPlan(_plan: Plan): void {
    // Plans are handled by the MCP server, not displayed here
  }

  async displayInitBanner(): Promise<void> {
    // No banner needed for MCP
  }

  async displayProgress(): Promise<void> {
    // Progress is not displayed in MCP mode
  }

  async hide(): Promise<void> {
    // Nothing to hide in MCP mode
  }

  async promptInitResultSelection(availableTypes: string[]): Promise<string[]> {
    // MCP clients should handle this through tool parameters
    return availableTypes;
  }

  async promptInput(_prompt: string, _error?: string, _placeholder?: string): Promise<string> {
    // MCP clients cannot provide interactive input
    // Return empty string as fallback
    return '';
  }

  async promptConfirmation(_message: string): Promise<boolean> {
    // MCP clients cannot provide interactive confirmation
    // Default to true for apply operations
    return true;
  }

  async promptOptions(_message: string, _options: string[]): Promise<number> {
    // MCP clients cannot provide interactive selection
    // Default to first option
    return 0;
  }

  async promptSudo(
    _pluginName: string,
    _data: CommandRequestData,
    _secureMode: boolean
  ): Promise<string | undefined> {
    // MCP clients cannot provide sudo password interactively
    // Return undefined to indicate no password available
    return undefined;
  }

  async promptUserForValues(
    _resources: Array<ResourceInfo>,
    _promptType: PromptType
  ): Promise<ResourceConfig[]> {
    // MCP clients cannot provide interactive values
    // Return empty array
    return [];
  }

  async promptPressKeyToContinue(_message?: string): Promise<void> {
    // No key press needed in MCP mode
  }

  displayImportResult(_importResult: ImportResult, _showConfigs: boolean): void {
    // Import results are handled by the MCP server
  }

  displayFileModifications(_diff: Array<{ file: string; modification: FileModificationResult }>): void {
    // File modifications are handled by the MCP server
  }

  displayMessage(_message: string): void {
    // Messages are logged but not displayed in MCP mode
  }

  async displayImportWarning(
    _requiresParameters: string[],
    _noParametersRequired: string[]
  ): Promise<void> {
    // Warnings are handled by the MCP server
  }
}
