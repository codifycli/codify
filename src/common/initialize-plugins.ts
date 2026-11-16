import { Config } from '@codifycli/schemas';

import { Project } from '../entities/project.js';
import { TemplateConfig } from '../entities/template-config.js';
import { SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { CodifyResolver, type CodifySource, CodifySourceType } from '../parser/resolver.js';
import { PluginManager, ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { templateExpander, templateLoader } from '../templates/template-expander.js';
import { MergeWarning, TemplateResourceMerger } from '../templates/template-resource-merger.js';
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
  // Expand template declarations into their resources (plan, apply and destroy)
  expandTemplates?: boolean;
}

export interface InitializationResult {
  resourceDefinitions: ResourceDefinitionMap
  pluginManager: PluginManager,
  project: Project,
  // Values that could not be merged when merging duplicate resources from templates
  templateMergeWarnings: MergeWarning[],
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

    // Merging duplicates asks the plugins (match), so it runs after plugin initialization and after the os/distro
    // filters so that resources that don't apply to this machine are not merged.
    const templateMergeWarnings = project.templatesExpanded
      ? await TemplateResourceMerger.merge(project, pluginManager, resourceDefinitions)
      : [];

    return { resourceDefinitions, pluginManager, project, templateMergeWarnings };
  }

  private static async parseProject(
    args: InitializeArgs,
    reporter: Reporter,
  ): Promise<Project> {
    if (args.forceEmptyProject) {
      return Project.empty();
    }

    if (args.codifyConfigs) {
      const project = await CodifyParser.parseJson(args.codifyConfigs);
      if (args.expandTemplates) {
        await templateExpander.expand(project);
      }

      return project;
    }

    const source = await CodifyResolver.resolve({
      location: args.path,
      allowTemplates: args.allowTemplates,
      allowEmpty: args.allowEmptyProject,
    }, reporter);

    ctx.subprocessStarted(SubProcessName.PARSE);
    const project = await PluginInitOrchestrator.parseSource(source);
    project.source = source;
    if (args.expandTemplates) {
      await templateExpander.expand(project);
    }
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
        // `codify apply <template>` is a project with a single template declaration. The template was already fetched
        // by the resolver.
        templateLoader.seed(source.location, source.template);
        return Project.create([new TemplateConfig({ type: 'template', source: source.location })], []);
      }

      default: {
        return Project.empty();
      }
    }
  }
}
