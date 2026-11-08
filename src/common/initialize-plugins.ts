import { Config } from '@codifycli/schemas';

import { Project } from '../entities/project.js';
import { SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { CodifyResolver, type CodifySource, CodifySourceType } from '../parser/resolver.js';
import { PluginManager, ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { ShellUtils } from '../utils/shell.js';

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
    await ShellUtils.validateShell();

    const project = await PluginInitOrchestrator.parseProject(
      args,
      reporter
    );

    if (!args.noProgress) ctx.subprocessStarted(SubProcessName.INITIALIZE_PLUGINS)
    const pluginManager = new PluginManager();
    const resourceDefinitions = await pluginManager.initialize(project, args.secure, args.verbosityLevel);
    if (!args.noProgress) ctx.subprocessFinished(SubProcessName.INITIALIZE_PLUGINS)

    project.removeResourcesUsingOsFilter();
    await project.removeResourcesUsingDistroFilter();

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

    const source = await CodifyResolver.resolve({
      location: args.path,
      allowTemplates: args.allowTemplates,
      allowEmpty: args.allowEmptyProject,
    }, reporter);

    ctx.subprocessStarted(SubProcessName.PARSE);
    const project = await PluginInitOrchestrator.parseSource(source);
    project.source = source;
    ctx.subprocessFinished(SubProcessName.PARSE);

    if (args.transformProject) {
      return args.transformProject(project);
    }

    return project;
  }

  private static async parseSource(source: CodifySource | null): Promise<Project> {
    switch (source?.type) {
      case CodifySourceType.LOCAL: {
        return CodifyParser.parse(source.path);
      }

      case CodifySourceType.REMOTE: {
        return CodifyParser.parse(source.documentId);
      }

      case CodifySourceType.TEMPLATE: {
        return CodifyParser.parseTemplate(source.template);
      }

      default: {
        return Project.empty();
      }
    }
  }
}
