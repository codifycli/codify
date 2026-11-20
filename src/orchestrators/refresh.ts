import { PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { ImportOrchestrator } from './import.js';
import type { ResolvedVariable } from '../variables/variable-resolver.js';

export type RefreshResult = { result: ResourceConfig[], errors: string[] }

export interface RefreshArgs {
  typeIds?: string[];
  path: string;
  secureMode?: boolean;
  verbosityLevel?: number;
  // Values for variables (--var). Used instead of asking.
  variableValues?: ResolvedVariable[];
  // The dashboard document being run and the saved secrets approved on the dashboard (codify connect)
  documentId?: string;
  approvedSecrets?: string[];
}

export class RefreshOrchestrator {
  static async run(
    args: RefreshArgs,
    reporter: Reporter
  ) {
    const typeIds = args.typeIds?.filter(Boolean)
    ctx.processStarted(ProcessName.REFRESH)

    const initializationResult = await PluginInitOrchestrator.run(
      // Variables are resolved so that resources are refreshed with their values. Resources whose when condition
      // doesn't match are not refreshed. ${{ }} references are kept when writing back to the file.
      { ...args, allowEmptyProject: true, resolveVariables: true },
      reporter,
    );
    const { project, pluginManager } = initializationResult;

    await pluginManager.validate(project);
    const importResult = await ImportOrchestrator.import(
      pluginManager,
      project.resourceConfigs.filter((r) => !typeIds || typeIds.length === 0 || typeIds.includes(r.type))
    );

    ctx.processFinished(ProcessName.REFRESH);

    await reporter.displayImportResult(importResult, false);


    // Special handling for remote-file resources. Offer to save them remotely if any changes are detected on import.
    await ImportOrchestrator.handleCodifyRemoteFiles(reporter, importResult);

    const resourceInfoList = await pluginManager.getMultipleResourceInfo(
      project.resourceConfigs.map((r) => r.type),
    );

    await ImportOrchestrator.updateExistingFiles(
      reporter,
      project,
      importResult,
      resourceInfoList,
      project.codifyFiles[0],
      pluginManager,
    );
  }
}

