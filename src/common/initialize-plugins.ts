import { Config } from '@codifycli/schemas';

import { Project } from '../entities/project.js';
import { TemplateConfig } from '../entities/template-config.js';
import { SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { CodifyResolver, type CodifySource, CodifySourceType } from '../parser/resolver.js';
import { PluginManager, ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { TemplateExpander, templateExpander, templateLoader } from '../templates/template-expander.js';
import { MergeWarning, TemplateResourceMerger } from '../templates/template-resource-merger.js';
import { ShellUtils } from '../utils/shell.js';
import { SavedValuesLoader } from '../variables/saved-values.js';
import { ResolvedVariable, VariableResolver } from '../variables/variable-resolver.js';

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
  // Expand template declarations into their resources (plan, apply and destroy). Resolves the variables as well.
  expandTemplates?: boolean;
  // Resolve the variables of the project file without expanding templates (import and refresh)
  resolveVariables?: boolean;
  // Values for variables (--var flags, values forwarded by the dashboard or by codify test). Used instead of asking.
  variableValues?: ResolvedVariable[];
  // Saved variables and secrets (${{ secrets.user.NAME }}) can be used. False for configs written by the Codify agent.
  allowSavedValues?: boolean;
  // The dashboard document being run (for secrets.file.*). Defaults to the document of a remote project.
  documentId?: string;
  // Saved secrets approved on the dashboard for this run: not asked again
  approvedSecrets?: string[];
  // --auto-approve-all: approves template commands and saved secrets
  autoApproveTemplateCommands?: boolean;
  autoApproveAll?: boolean;
}

export interface InitializationResult {
  resourceDefinitions: ResourceDefinitionMap
  pluginManager: PluginManager,
  project: Project,
  // Values that could not be merged when merging duplicate resources from templates
  templateMergeWarnings: MergeWarning[],
  // The values of the variables that were used
  resolvedVariables: ResolvedVariable[],
}

export class PluginInitOrchestrator {
  static async run(
    args: InitializeArgs,
    reporter: Reporter,
  ): Promise<InitializationResult> {
    await ShellUtils.validateShell();

    const { project, resolvedVariables } = await PluginInitOrchestrator.parseProject(args, reporter);

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

    return { resourceDefinitions, pluginManager, project, templateMergeWarnings, resolvedVariables };
  }

  private static async parseProject(
    args: InitializeArgs,
    reporter: Reporter,
  ): Promise<{ project: Project; resolvedVariables: ResolvedVariable[] }> {
    if (args.forceEmptyProject) {
      return { project: Project.empty(), resolvedVariables: [] };
    }

    if (args.codifyConfigs) {
      const project = await CodifyParser.parseJson(args.codifyConfigs);
      const resolvedVariables = await PluginInitOrchestrator.resolveVariables(project, args, reporter);
      return { project, resolvedVariables };
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
    const resolvedVariables = await PluginInitOrchestrator.resolveVariables(project, args, reporter);

    return {
      project: args.transformProject ? await args.transformProject(project) : project,
      resolvedVariables,
    };
  }

  /**
   * Loads the saved variables and secrets of the project file, asks for the values of the variables (while nothing
   * else is shown) and expands the templates. Returns the values that were used.
   */
  private static async resolveVariables(project: Project, args: InitializeArgs, reporter: Reporter): Promise<ResolvedVariable[]> {
    if (!args.expandTemplates && !args.resolveVariables) {
      return [];
    }

    const presets = args.variableValues ?? [];
    const saved = await SavedValuesLoader.load(project, {
      allowed: args.allowSavedValues ?? true,
      documentId: args.documentId ?? (project.source?.type === CodifySourceType.REMOTE ? project.source.documentId : undefined),
      configKey: project.codifyFiles[0] ?? 'inline config',
      presetKeys: SavedValuesLoader.presetKeys(presets),
      approvedSecrets: args.approvedSecrets,
      autoApproveAll: args.autoApproveAll ?? args.autoApproveTemplateCommands,
      reporter,
    });

    // Reporters that can show a form ask for the variables of a file on one screen
    const variables = new VariableResolver(
      (request) => reporter.promptVariable(request),
      [...presets, ...saved.presets],
      reporter.promptVariableForm ? (form) => reporter.promptVariableForm!(form) : undefined,
      { sensitiveKeys: saved.sensitiveKeys, hints: saved.hints },
    );

    await (args.expandTemplates
      ? templateExpander.expand(project, variables)
      : TemplateExpander.resolveProjectVariables(project, variables));

    return variables.resolved;
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
