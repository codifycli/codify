import { SubProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { InitializationResult, PluginInitOrchestrator } from '../common/initialize-plugins.js';

export interface ValidateArgs {
  existing?: InitializationResult;
  path?: string;
  verbosityLevel?: number;
  noProgress?: boolean;
}

export const ValidateOrchestrator = {

  async run(
    args: ValidateArgs,
    reporter: Reporter
  ): Promise<void> {
    const {
      project,
      resourceDefinitions,
      pluginManager,
    } = args.existing ?? await PluginInitOrchestrator.run(args, reporter)

    if (!args.noProgress) {
      if (args.existing) {
        ctx.subprocessStarted(SubProcessName.VALIDATE)
      } else {
        if (!args.noProgress) ctx.processStarted(SubProcessName.VALIDATE)
      }
    }

    project.validateTypeIds(resourceDefinitions);
    const validationResults = await pluginManager.validate(project);
    project.handlePluginResourceValidationResults(validationResults);

    if (!args.noProgress) {
      if (args.existing) {
        ctx.subprocessFinished(SubProcessName.VALIDATE)
      } else {
        ctx.processFinished(SubProcessName.VALIDATE)
      }
    }
  },
};
