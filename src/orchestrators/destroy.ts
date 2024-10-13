import { InternalError } from '../common/errors.js';
import { CommonOrchestrator } from '../common/orchestrator.js';
import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { getTypeAndNameFromId } from '../utils/index.js';
import { PlanOrchestratorResponse } from './plan.js';

export class DestroyOrchestrator {
  static async getDestroyPlan(
    ids: string[], path: null | string, secureMode: boolean): Promise<PlanOrchestratorResponse> {
    if (ids.length === 0) {
      throw new InternalError('getDestroyPlan called with no ids passed in');
    }

    ctx.processStarted(ProcessName.PLAN)

    const project = await DestroyOrchestrator.parse(path, ids)

    const { dependencyMap, pluginManager } = await CommonOrchestrator.initializePlugins(project, secureMode);
    await DestroyOrchestrator.validate(project, pluginManager, dependencyMap)

    const uninstallProject = project.toUninstallProject()
    uninstallProject.resolveResourceDependencies(dependencyMap);
    uninstallProject.calculateEvaluationOrder();

    const plan = await DestroyOrchestrator.plan(uninstallProject, pluginManager)
    return {
      plan,
      pluginManager,
      project,
    };
  }

  private static async parse(path: null | string, ids: string[]): Promise<Project> {
    ctx.subprocessStarted(SubProcessName.PARSE);
    let project: Project;

    if (path) {
      const parsedProject = await CodifyParser.parse(path);
      parsedProject.filter(ids) // We only care about the types being uninstalled

      const nonProjectConfigs = ids.filter((id) =>
        parsedProject.resourceConfigs.findIndex((r) => r.id === id) === -1
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

  private static async plan(project: Project, pluginManager: PluginManager): Promise<Plan> {
    ctx.subprocessStarted(SubProcessName.GENERATE_PLAN)
    const plan = await pluginManager.getPlan(project);
    ctx.subprocessFinished(SubProcessName.GENERATE_PLAN)

    return plan;
  }
}
