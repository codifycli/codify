import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { validate } from 'uuid';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { LoginHelper } from '../connect/login-helper.js';
import { Project } from '../entities/project.js';
import { SubProcessName, ctx } from '../events/context.js';
import { CODIFY_FILE_REGEX, CodifyParser } from '../parser/index.js';
import { PluginManager, ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { FileUtils } from '../utils/file.js';

export interface InitializeArgs {
  path?: string;
  secure?: boolean;
  verbosityLevel?: number;
  transformProject?: (project: Project) => Project | Promise<Project>;
  allowEmptyProject?: boolean;
  forceEmptyProject?: boolean;
}

export interface InitializationResult {
  resourceDefinitions: ResourceDefinitionMap
  pluginManager: PluginManager,
  project: Project,
}

export class PluginInitOrchestrator {
  static async run(
    args: InitializeArgs,
    reporter: Reporter,
  ): Promise<InitializationResult> {
    const project = await PluginInitOrchestrator.parseProject(
      args,
      reporter
    );

    ctx.subprocessStarted(SubProcessName.INITIALIZE_PLUGINS)
    const pluginManager = new PluginManager();
    const resourceDefinitions = await pluginManager.initialize(project, args.secure, args.verbosityLevel);
    ctx.subprocessFinished(SubProcessName.INITIALIZE_PLUGINS)

    return { resourceDefinitions, pluginManager, project };
  }

  private static async parseProject(
    args: InitializeArgs,
    reporter: Reporter,
  ): Promise<Project> {
    if (args.forceEmptyProject) {
      return Project.empty();
    }

    const codifyPath = await PluginInitOrchestrator.resolveCodifyRootPath(args, reporter);
    ctx.subprocessStarted(SubProcessName.PARSE);

    const project = codifyPath
      ? await CodifyParser.parse(codifyPath)
      : Project.empty()

    ctx.subprocessFinished(SubProcessName.PARSE);

    if (args.transformProject) {
      return args.transformProject(project);
    }

    return project;
  }

  /** Resolve the root codify file to run.
   * Order:
   * 1. If path is specified, return that.
   * 2. If path is a dir with only one *codify.json|*codify.jsonc|*codify.json5|*codify.yaml, return that.
   * 3. If path is a UUID, return file from Codify cloud.
   * 4. If multiple exists in the path (dir), then prompt the user to select one.
   * 5. If no path is provided, run steps 2 - 4 for the current dir.
   * 6. If none exists, return default file from codify cloud.
   * 7. If user is not logged in, return an error.
   *
   * @param args
   * @private
   */
  private static async resolveCodifyRootPath(args: InitializeArgs, reporter: Reporter): Promise<string | undefined> {
    const inputPath = args.path ?? process.cwd();

    // Cloud files will be fetched and processed later in the parser.
    const isCloud = validate(inputPath);
    if (isCloud) {
      return inputPath;
    }

    // Direct files can have its path returned.
    const isPathDir = await FileUtils.isDir(inputPath);
    if (!isPathDir) {
      return inputPath;
    }

    const filesInDir = await fs.readdir(inputPath);
    const codifyFiles = filesInDir.filter((f) => CODIFY_FILE_REGEX.test(f))

    if (codifyFiles.length === 1) {
      return codifyFiles[0];
    }

    if (codifyFiles.length > 0) {
      const answer = await reporter.promptOptions(
        'Multiple codify files found in dir. Please select one:',
        codifyFiles,
      );

      return path.join(inputPath, codifyFiles[answer]);
    }

    if (LoginHelper.get()?.isLoggedIn) {
      return (await DashboardApiClient.getDefaultDocumentId()) ?? undefined;
    }

    if (args.allowEmptyProject) {
      return undefined;
    }

    throw new Error('No codify files found.');
  }

}
