import { InitializationResult, PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ResourceInfo } from '../entities/resource-info.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { PluginManager, ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { DefaultReporter } from '../ui/reporters/default-reporter.js';
import { PromptType, Reporter } from '../ui/reporters/reporter.js';
import { SleepInhibitor } from '../utils/sleep-inhibitor.js';
import { wildCardMatch } from '../utils/wild-card-match.js';

export interface DestroyArgs {
  typeIds: string[];
  path?: string;
  secureMode?: boolean;
  verbosityLevel?: number;
  autoApprove?: boolean;
  allowSleep?: boolean;
}

export class DestroyOrchestrator {

  static async run(args: DestroyArgs, reporter: Reporter) {
    const typeIds = args.typeIds?.filter(Boolean)
    ctx.processStarted(ProcessName.PLAN)

    const initializationResult = await PluginInitOrchestrator.run(
      { ...args, allowEmptyProject: true, },
      reporter
    );
    const { pluginManager, project } = initializationResult;

    if ((!typeIds || typeIds.length === 0) && project.isEmpty()) {
      throw new Error('At least one resource [type] must be specified. Ex: "codify destroy homebrew". Or the destroy command must be run in a directory with a valid codify file')
    }

    const { plan, destroyProject } = (!typeIds || typeIds.length === 0)
      ? await DestroyOrchestrator.destroyExistingProject(reporter, initializationResult)
      : await DestroyOrchestrator.destroySpecificResources(typeIds, reporter, initializationResult)

    ctx.processFinished(ProcessName.DESTROY)

    plan.sortByEvalOrder(project.evaluationOrder);
    destroyProject.removeNoopFromEvaluationOrder(plan);

    await reporter.displayPlan(plan);

    // Short circuit and exit if every change is NOOP
    if (plan.isEmpty()) {
      console.log('No changes necessary. Exiting');
      return;
    }

    if (!args.autoApprove) {
      const confirm = await reporter.promptConfirmation('Do you want to destroy?')
      if (!confirm) {
        return;
      }
    }

    ctx.processStarted(ProcessName.DESTROY)

    const filteredPlan = plan.filterNoopResources()

    let currentVerbosity = args.verbosityLevel ?? 0;
    if (reporter instanceof DefaultReporter) {
      reporter.onVerbosityToggle(async () => {
        currentVerbosity = currentVerbosity === 0 ? 3 : 0;
        await pluginManager.setVerbosityLevel(currentVerbosity);
      });
    }

    const inhibitor = args.allowSleep ? null : SleepInhibitor.start();
    if (inhibitor && reporter instanceof DefaultReporter) {
      reporter.setSleepPrevented(true);
    }

    try {
      await reporter.displayProgress();
      const applyResult = await ctx.process(ProcessName.DESTROY, () =>
        pluginManager.apply(destroyProject, filteredPlan)
      )

      await reporter.displayApplyComplete(applyResult);

      if (applyResult.isPartialFailure()) {
        process.exit(1);
      }
    } finally {
      inhibitor?.stop();
    }
  }

  /** This method is responsible for generating a plan for specific resources specified by the user */
  private static async destroySpecificResources(
    typeIds: string[],
    reporter: Reporter,
    initializeResult: InitializationResult
  ): Promise<{ plan: Plan, destroyProject: Project }> {
    const { project, pluginManager, resourceDefinitions } = initializeResult;

    // TODO: In the future if a user supplies resourceId.name (naming a specific resource) destroy that resource instead of stripping the name out.
    const matchedTypes = this.matchTypeIds(typeIds.map((id) => id.split('.').at(0) ?? ''), [...resourceDefinitions.keys()])
    await DestroyOrchestrator.validateTypeIds(matchedTypes, project, pluginManager, resourceDefinitions);

    const resourceInfoList = (await pluginManager.getMultipleResourceInfo(matchedTypes));
    const resourcesToDestroy = await DestroyOrchestrator.getDestroyParameters(reporter, initializeResult, resourceInfoList);

    const destroyProject = new Project(
      null,
      resourcesToDestroy,
      project.codifyFiles
    ).toDestroyProject();

    destroyProject.resolveDependenciesAndCalculateEvalOrder(resourceDefinitions);
    const plan = await ctx.subprocess(ProcessName.PLAN, () =>
      pluginManager.plan(destroyProject)
    )

    return { plan, destroyProject };
  }

  /** This method is responsible for generating the plan when no args are specified (ie: destroy all resources inside a codify.json file) **/
  private static async destroyExistingProject(
    reporter: Reporter,
    initializeResult: InitializationResult
  ): Promise<{ plan: Plan, destroyProject: Project }> {
    const { pluginManager, project, resourceDefinitions } = initializeResult;

    await ctx.subprocess(SubProcessName.VALIDATE, async () => {
      project.validateTypeIds(resourceDefinitions);
      const validationResults = await pluginManager.validate(project);
      project.handlePluginResourceValidationResults(validationResults);
    })

    const destroyProject = project.toDestroyProject();
    destroyProject.resolveDependenciesAndCalculateEvalOrder(resourceDefinitions);

    const plan = await ctx.subprocess(ProcessName.PLAN, () =>
      pluginManager.plan(destroyProject)
    )

    return { plan, destroyProject };
  }

  private static matchTypeIds(typeIds: string[], validTypeIds: string[]): string[] {
    const result: string[] = [];
    const unsupportedTypeIds: string[] = [];

    for (const typeId of typeIds) {
      if (!typeId.includes('*') && !typeId.includes('?')) {
        const matched = validTypeIds.includes(typeId);
        if (!matched) {
          unsupportedTypeIds.push(typeId);
          continue;
        }

        result.push(typeId)
        continue;
      }

      const matched = validTypeIds.filter((valid) => wildCardMatch(valid, typeId))
      if (matched.length === 0) {
        unsupportedTypeIds.push(typeId);
        continue;
      }

      result.push(...matched);
    }

    if (unsupportedTypeIds.length > 0) {
      throw new Error(`The following resources cannot be destroyed. No plugins found that support the following types:
${JSON.stringify(unsupportedTypeIds)}`);
    }

    return result;
  }

  private static async validateTypeIds(typeIds: string[], project: Project, pluginManager: PluginManager, resourceDefinitions: ResourceDefinitionMap): Promise<void> {
    project.validateTypeIds(resourceDefinitions);

    const unsupportedTypeIds = typeIds.filter((type) => !resourceDefinitions.has(type));
    if (unsupportedTypeIds.length > 0) {
      throw new Error(`The following resources cannot be destroyed. No plugins found that support the following types:
${JSON.stringify(unsupportedTypeIds)}`);
    }
  }

  /**
   * Resources that support multiple instances need identifying values before they can be destroyed (ex: which git
   * repository). Instead of asking for raw values, existing instances are found on the system (same as import all) and
   * the user picks one. The user can always choose to enter the values manually instead.
   */
  private static async getDestroyParameters(
    reporter: Reporter,
    initializeResult: InitializationResult,
    resourceInfoList: ResourceInfo[],
  ): Promise<Array<ResourceConfig>> {
    const { project, pluginManager, resourceDefinitions } = initializeResult;

    // Figure out which resources we need to prompt the user for additional info (based on the resource info)
    const [noPrompt, askPrompt] = resourceInfoList.reduce((result, info) => {
      info.getRequiredParameters().length === 0 ? result[0].push(info) : result[1].push(info);
      return result;
    }, [<ResourceInfo[]>[], <ResourceInfo[]>[]])

    const existingInstances = askPrompt.length > 0
      ? await ctx.subprocess(SubProcessName.FIND_EXISTING_RESOURCES, () => Promise.all(askPrompt.map((info) =>
        DestroyOrchestrator.findExistingInstances(pluginManager, info, resourceDefinitions.get(info.type)?.sensitiveParameters ?? [])
      )))
      : [];

    const selected: ResourceConfig[] = [];
    const enterManually: ResourceInfo[] = [];
    for (const [idx, info] of askPrompt.entries()) {
      const instances = existingInstances[idx];
      if (instances.length === 0) {
        enterManually.push(info);
        continue;
      }

      const choice = await reporter.promptOptions(
        `Multiple instances of "${info.type}" can exist. Which one would you like to destroy?`,
        [...instances.map((i) => i.label), 'Enter the values manually'],
      );

      if (choice < instances.length) {
        selected.push(instances[choice].resource);
      } else {
        enterManually.push(info);
      }
    }

    let userSupplied: ResourceConfig[] = [];
    if (enterManually.length > 0) {
      enterManually.forEach((info) => {
        const matchedResources = project.findAll(info.type);
        if (matchedResources.length > 0) {
          info.attachDefaultValues(matchedResources[0]);
        }
      })

      await reporter.displayImportWarning(enterManually.map((r) => r.type), noPrompt.map((r) => r.type));
      userSupplied = await reporter.promptUserForValues(enterManually, PromptType.DESTROY);
    }

    return [
      ...noPrompt.map((info) => new ResourceConfig({ type: info.type })),
      ...selected,
      ...userSupplied,
    ]
  }

  /**
   * Find the instances of a resource that exist on the system using the plugin's findInstances (discovery only, separate
   * from import so resources that can't be imported can still be discovered). Each instance is labelled by the values
   * required to identify it. Returns an empty list if no instances are found or the plugin doesn't support discovery.
   */
  private static async findExistingInstances(
    pluginManager: PluginManager,
    info: ResourceInfo,
    sensitiveParameters: string[],
  ): Promise<Array<{ label: string; resource: ResourceConfig }>> {
    // Never list the values of a resource that is entirely sensitive
    if (sensitiveParameters.includes('*')) {
      return [];
    }

    let imported: ResourceConfig[];
    try {
      const response = await pluginManager.findInstances(info.type);
      imported = (response.result ?? []).map((r) => ResourceConfig.fromJson(r));
    } catch (error) {
      ctx.debug(`Unable to find existing instances of ${info.type}: ${error}`);
      return [];
    }

    const requiredNames = info.getRequiredParameters().map((p) => p.name);
    const seen = new Set<string>();
    const labelCounts = new Map<string, number>();

    return imported
      // The imported instance is used as is: it contains every value the plugin needs to match it on the system
      .filter((resource) => {
        const key = JSON.stringify(resource.parameters);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((resource) => {
        const baseLabel = requiredNames
          .filter((name) => resource.parameters[name] !== undefined)
          .map((name) => `${name}: ${sensitiveParameters.includes(name) ? '********' : JSON.stringify(resource.parameters[name])}`)
          .join(', ') || resource.type;

        // Keep labels unique when instances only differ in values that aren't shown
        const count = (labelCounts.get(baseLabel) ?? 0) + 1;
        labelCounts.set(baseLabel, count);

        return { label: count > 1 ? `${baseLabel} (${count})` : baseLabel, resource };
      });
  }

}
