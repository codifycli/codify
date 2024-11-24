import { InternalError } from '../common/errors.js';
import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { getTypeAndNameFromId } from '../utils/index.js';
import { InitializeOrchestrator } from './initialize.js';

export interface DestroyArgs {
  ids: string[];
  path: string;
  secureMode?: boolean;
}

export class DestroyOrchestrator {

  static async run(args: DestroyArgs, reporter: Reporter) {
    const { ids, path, secureMode } = args;
    ctx.processStarted(ProcessName.DESTROY)
    
    const project = await DestroyOrchestrator.parse(path, ids)
    const { dependencyMap, pluginManager } = await InitializeOrchestrator.run(project, secureMode ?? false);
    await DestroyOrchestrator.validate(project, pluginManager, dependencyMap)

    if (ids.length === 0) {
      throw new InternalError('getDestroyPlan called with no ids passed in');
    }

    const uninstallProject = project.toDestroyProject()
    uninstallProject.resolveResourceDependencies(dependencyMap);
    uninstallProject.calculateEvaluationOrder();

    const plan = await ctx.process(ProcessName.PLAN, () =>
      pluginManager.getPlan(uninstallProject)
    )
    reporter.displayPlan(plan);

    // Short circuit and exit if every change is NOOP
    if (plan.isEmpty()) {
      console.log('No changes necessary. Exiting');
      return;
    }

    const confirm = await reporter.promptApplyConfirmation()
    if (!confirm) {
      return;
    }

    const filteredPlan = plan.filterNoopResources()

    await ctx.process(ProcessName.APPLY, () =>
      pluginManager.apply(uninstallProject, filteredPlan)
    )

    await reporter.displayApplyComplete([]);
  }

  private static async parse(path: null | string, ids: string[]): Promise<Project> {
    ctx.subprocessStarted(SubProcessName.PARSE);
    let project: Project;

    if (path) {
      const parsedProject = await CodifyParser.parse(path);
      parsedProject.filter(ids) // We only care about the types being uninstalled

      const nonProjectConfigs = ids.filter((id) =>
        parsedProject.resourceConfigs.findIndex((r) => r.id.includes(id)) === -1
      )

      parsedProject.add(...nonProjectConfigs.map((id) => {
        const { name, type } = getTypeAndNameFromId(id);
        return new ResourceConfig({ name, type })
      }))

      project = parsedProject
    } else {
      const emptyConfigs = ids.map(type => new ResourceConfig({ type }))
      project = new Project(null, emptyConfigs)
    }

    ctx.subprocessFinished(SubProcessName.PARSE);

    return project
  }

  private static async validate(project: Project, pluginManager: PluginManager, dependencyMap: DependencyMap): Promise<void> {
    ctx.subprocessStarted(SubProcessName.VALIDATE)

    project.validateTypeIds(dependencyMap);
    const validationResults = await pluginManager.validate(project);
    project.handlePluginResourceValidationResults(validationResults);

    ctx.subprocessFinished(SubProcessName.VALIDATE)
  }
}
