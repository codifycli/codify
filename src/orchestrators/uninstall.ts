import { PlanResponseData, ResourceOperation } from 'codify-schemas';
import { randomUUID } from 'node:crypto';

import { CommonOrchestrator } from '../common/orchestrator.js';
import { ctx, ProcessName, SubProcessName } from '../events/context.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { CodifyParser } from '../parser/index.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { Plan } from '../entities/plan.js';
import { getTypeAndNameFromId } from '../utils/index.js';

export class UninstallOrchestrator {
  static async getUninstallPlan(typeIds: string[], path: string | null, secureMode: boolean): Promise<any> {
    if (typeIds.length === 0) {
      return;
    }

    ctx.processStarted(ProcessName.PLAN)

    const project = await UninstallOrchestrator.parse(path, typeIds)

    const { pluginManager, dependencyMap } = await CommonOrchestrator.initializePlugins(project, secureMode);
    await UninstallOrchestrator.validate(project, pluginManager, dependencyMap)

    const uninstallProject = project.toUninstallProject()
    uninstallProject.resolveResourceDependencies(dependencyMap);
    uninstallProject.calculateEvaluationOrder();

    const plan = await UninstallOrchestrator.plan(uninstallProject, pluginManager)
    return {
      plan,
      pluginManager,
      project,
    };
  }

  private static async parse(path: string | null, ids: string[]): Promise<Project> {
    ctx.subprocessStarted(SubProcessName.PARSE);
    let project: Project;

    if (path) {
      const parsedProject = await CodifyParser.parse(path);
      parsedProject.filter(ids) // We only care about the types being uninstalled

      const nonProjectConfigs = ids.filter((id) =>
        parsedProject.resourceConfigs.findIndex((r) => r.id === id) === -1
      )

      parsedProject.add(...nonProjectConfigs.map((id) => {
        const { type, name } = getTypeAndNameFromId(id);
        return new ResourceConfig({ type, name })
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
