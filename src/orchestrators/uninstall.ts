import { PlanResponseData, ResourceOperation } from 'codify-schemas';
import { randomUUID } from 'node:crypto';

import { CommonOrchestrator } from '../common/orchestrator.js';
import { ctx, ProcessName, SubProcessName } from '../events/context.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { CodifyParser } from '../parser/index.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';

export class UninstallOrchestrator {
  static async run(typeIds: string[], path: string | null, secureMode: boolean): Promise<void> {
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


    ctx.processStarted(ProcessName.UNINSTALL);
    // await pluginManager.apply(plan);
    ctx.processFinished(ProcessName.UNINSTALL);

    const plan = typeIds.map((type) => ({
      operation: ResourceOperation.DESTROY,
      parameters: [] as any[],
      planId: randomUUID(),
      resourceType: type,
    } as PlanResponseData))
  }

  private static async parse(path: string | null, typeIds: string[]): Promise<Project> {
    ctx.subprocessStarted(SubProcessName.PARSE);
    let project: Project;

    if (path) {
      const parsedProject = await CodifyParser.parse(path);
      project = parsedProject.filter(typeIds) // We only care about the types being uninstalled
    } else {
      const emptyConfigs = typeIds.map(type => new ResourceConfig({ type }))
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
