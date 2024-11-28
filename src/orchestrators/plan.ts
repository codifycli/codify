import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CODIFY_FILE_REGEX, CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { createStartupShellScriptsIfNotExists } from '../utils/file.js';
import { InitializeOrchestrator } from './initialize.js';

export interface PlanArgs {
  path?: string;
  secureMode?: boolean;
}

export interface PlanOrchestratorResponse {
  plan: Plan,
  pluginManager: PluginManager;
  project: Project;
}

export class PlanOrchestrator {
  static async run(args: PlanArgs, reporter: Reporter): Promise<PlanOrchestratorResponse> {
    ctx.processStarted(ProcessName.PLAN)

    const project = await PlanOrchestrator.parse(args.path, reporter)

    const { dependencyMap, pluginManager } = await InitializeOrchestrator.run(project, args.secureMode);
    await createStartupShellScriptsIfNotExists();

    await PlanOrchestrator.validate(project, pluginManager, dependencyMap)

    project.resolveResourceDependencies(dependencyMap);
    project.calculateEvaluationOrder();

    const plan = await PlanOrchestrator.plan(project, pluginManager)

    ctx.processFinished(ProcessName.PLAN)

    reporter.displayPlan(plan);

    return {
      plan,
      pluginManager,
      project,
    };
  }

  private static async parse(fileOrDir: string | undefined, reporter: Reporter): Promise<Project> {
    ctx.subprocessStarted(SubProcessName.PARSE);

    const pathToParse = (fileOrDir === undefined)
      ? await PlanOrchestrator.findCodifyJson()
      : fileOrDir

    if (!pathToParse) {
      const createRootCodifyFile = await reporter.promptConfirmation(`\nNo codify file found. Do you want to create a root file at ~/codify.json?`);

      if (createRootCodifyFile) {
        await fs.writeFile(
          path.resolve(os.homedir(), 'codify.json'),
          '[]',
          { encoding: 'utf8', flag: 'wx' }
        ); // flag: 'wx' prevents overwrites if the file exists
      }

      console.log('Created ~/codify.json file')

      process.exit(0);
    }

    const project = await CodifyParser.parse(pathToParse);

    // Always add xcode tools as a dependency to make sure it's installed. This may be temporary if required dependencies get added.
    project.addXCodeToolsConfig();
    ctx.subprocessFinished(SubProcessName.PARSE);

    return project
  }

  private static async findCodifyJson(dir?: string): Promise<null | string> {
    dir = dir ?? process.cwd();

    const filesInDir = await fs.readdir(dir);
    if (filesInDir.some((f) => CODIFY_FILE_REGEX.test(f))) {
      return dir;
    }

    if (dir.includes(os.homedir()) && dir !== os.homedir()) {
      return this.findCodifyJson(path.dirname(dir))
    }

    return null;
  }

  private static async validate(project: Project, pluginManager: PluginManager, dependencyMap: DependencyMap) {
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
