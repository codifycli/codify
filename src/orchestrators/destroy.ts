import { InternalError } from '../common/errors.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { getTypeAndNameFromId } from '../utils/index.js';
import { InitializeOrchestrator } from './initialize.js';

export interface DestroyArgs {
  ids: string[];
  path?: string;
  secureMode?: boolean;
}

export class DestroyOrchestrator {

  static async run(args: DestroyArgs, reporter: Reporter) {
    const { ids } = args;
    if (ids.length === 0) {
      throw new InternalError('getDestroyPlan called with no ids passed in');
    }

    ctx.processStarted(ProcessName.DESTROY)
    
    const { typeIdsToDependenciesMap, pluginManager, project } = await InitializeOrchestrator.run({
      ...args,
      allowEmptyProject: true,
      transformProject(project) {
        project.filter(ids) // We only care about the types being uninstalled

        const nonProjectConfigs = ids.filter((id) =>
          project.resourceConfigs.findIndex((r) => r.id.includes(id)) === -1
        )

        project.add(...nonProjectConfigs.map((id) => {
          const { name, type } = getTypeAndNameFromId(id);
          return new ResourceConfig({ name, type })
        }))

        return project;
      }
    }, reporter);

    await DestroyOrchestrator.validate(project, pluginManager, typeIdsToDependenciesMap)

    const uninstallProject = project.toDestroyProject()
    uninstallProject.resolveDependenciesAndCalculateEvalOrder(typeIdsToDependenciesMap);

    const plan = await ctx.subprocess(ProcessName.PLAN, () =>
      pluginManager.plan(uninstallProject)
    )
    reporter.displayPlan(plan);

    // Short circuit and exit if every change is NOOP
    if (plan.isEmpty()) {
      console.log('No changes necessary. Exiting');
      return;
    }

    const confirm = await reporter.promptConfirmation('Do you want to destroy?')
    if (!confirm) {
      return;
    }

    const filteredPlan = plan.filterNoopResources()

    await ctx.process(ProcessName.DESTROY, () =>
      pluginManager.apply(uninstallProject, filteredPlan)
    )

    await reporter.displayMessage(`
🎉 Finished applying 🎉
Open a new terminal or source '.zshrc' for the new changes to be reflected`);
  }

  private static async validate(project: Project, pluginManager: PluginManager, dependencyMap: DependencyMap): Promise<void> {
    ctx.subprocessStarted(SubProcessName.VALIDATE)

    project.validateTypeIds(dependencyMap);
    const validationResults = await pluginManager.validate(project);
    project.handlePluginResourceValidationResults(validationResults);

    ctx.subprocessFinished(SubProcessName.VALIDATE)
  }
}
