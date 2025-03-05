import { SubProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { InitializationResult, InitializeOrchestrator } from './initialize-plugins.js';

export interface ValidateArgs {
  existing?: InitializationResult;
  path?: string;
}

export const ValidateOrchestrator = {

  async run(
    args: ValidateArgs,
    reporter: Reporter
  ): Promise<void> {
    const {
      project,
      typeIdsToDependenciesMap: dependencyMap,
      pluginManager,
    } = args.existing ?? await InitializeOrchestrator.run(args, reporter)

    if (args.existing) {
      ctx.subprocessStarted(SubProcessName.VALIDATE)
    } else {
      ctx.processStarted(SubProcessName.VALIDATE)
    }

    project.validateTypeIds(dependencyMap);
    const validationResults = await pluginManager.validate(project);
    project.handlePluginResourceValidationResults(validationResults);

    if (args.existing) {
      ctx.subprocessFinished(SubProcessName.VALIDATE)
    } else {
      ctx.processFinished(SubProcessName.VALIDATE)
    }
  },
};
