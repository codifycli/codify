import { Config } from 'codify-schemas';
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { validate } from 'uuid';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { CodifyParser } from '../codify-files/parser/index.js';
import { CodifyResolver } from '../codify-files/resolver/index.js';
import { config } from '../config.js';
import { LoginHelper } from '../connect/login-helper.js';
import { Project } from '../entities/project.js';
import { SubProcessName, ctx } from '../events/context.js';
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
  codifyConfigs?: Config[];
  noProgress?: boolean;
  allowTemplates?: boolean;
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

    if (!args.noProgress) ctx.subprocessStarted(SubProcessName.INITIALIZE_PLUGINS)
    const pluginManager = new PluginManager();
    const resourceDefinitions = await pluginManager.initialize(project, args.secure, args.verbosityLevel);
    if (!args.noProgress) ctx.subprocessFinished(SubProcessName.INITIALIZE_PLUGINS)

    return { resourceDefinitions, pluginManager, project };
  }

  private static async parseProject(
    args: InitializeArgs,
    reporter: Reporter,
  ): Promise<Project> {
    if (args.forceEmptyProject) {
      return Project.empty();
    }

    if (args.codifyConfigs) {
      return CodifyParser.parseJson(args.codifyConfigs);
    }

    ctx.subprocessStarted(SubProcessName.RESOLVE);

    const codifyFile = await CodifyResolver.resolveFile(args.path ?? process.cwd(), {
      allowTemplates: args.allowTemplates,
      allowEmpty: args.allowEmptyProject,
      reporter,
    });

    ctx.subprocessFinished(SubProcessName.RESOLVE);
    ctx.subprocessStarted(SubProcessName.PARSE);

    const project = codifyFile
      ? await CodifyParser.parse(codifyFile)
      : Project.empty()

    ctx.subprocessFinished(SubProcessName.PARSE);

    if (args.transformProject) {
      return args.transformProject(project);
    }

    return project;
  }
}
