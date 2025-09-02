import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { Project } from '../entities/project.js';
import { SubProcessName, ctx } from '../events/context.js';
import { CODIFY_FILE_REGEX, CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { LoginHelper } from '../connect/login-helper.js';

export interface InitializeArgs {
  path?: string;
  secure?: boolean;
  verbosityLevel?: number;
  transformProject?: (project: Project) => Project | Promise<Project>;
  allowEmptyProject?: boolean;
}

export interface InitializationResult {
  typeIdsToDependenciesMap: DependencyMap
  pluginManager: PluginManager,
  project: Project,
}

export class PluginInitOrchestrator {
  static async run(
    args: InitializeArgs,
    reporter: Reporter,
  ): Promise<InitializationResult> {
    let project = await PluginInitOrchestrator.parse(
      args.path,
      args.allowEmptyProject ?? false,
      reporter
    )
    if (args.transformProject) {
      project = await args.transformProject(project);
    }

    ctx.subprocessStarted(SubProcessName.INITIALIZE_PLUGINS)
    const pluginManager = new PluginManager();
    const typeIdsToDependenciesMap = await pluginManager.initialize(project, args.secure, args.verbosityLevel);
    ctx.subprocessFinished(SubProcessName.INITIALIZE_PLUGINS)

    return { typeIdsToDependenciesMap, pluginManager, project };
  }

  private static async parse(
    fileOrDir: string | undefined,
    allowEmptyProject: boolean,
    reporter: Reporter
  ): Promise<Project> {
    ctx.subprocessStarted(SubProcessName.PARSE);

    const pathToParse = (fileOrDir === undefined)
      ? await PluginInitOrchestrator.findCodifyJson()
      : fileOrDir

    const isLoggedIn = LoginHelper.get()?.isLoggedIn ?? false;

    if (!pathToParse && !allowEmptyProject && !isLoggedIn) {
      ctx.subprocessFinished(SubProcessName.PARSE);
      ctx.subprocessStarted(SubProcessName.CREATE_ROOT_FILE)
      const createRootCodifyFile = await reporter.promptConfirmation('\nNo codify file found. Do you want to create a root file at ~/codify.jsonc?');

      if (createRootCodifyFile) {
        await fs.writeFile(
          path.resolve(os.homedir(), 'codify.jsonc'),
          '[]',
          { encoding: 'utf8', flag: 'wx' }
        ); // flag: 'wx' prevents overwrites if the file exists
      }

      ctx.subprocessFinished(SubProcessName.CREATE_ROOT_FILE)

      console.log('Created ~/codify.jsonc file')
      process.exit(0);
    }

    const project = pathToParse
      ? await CodifyParser.parse(pathToParse)
      : Project.empty()

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

}
