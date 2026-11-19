import { ResourceOs } from '@codifycli/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardApiClient } from '../api/dashboard/index.js';
import { TemplateError } from '../common/errors.js';
import { Project } from '../entities/project.js';
import { TemplateConfig } from '../entities/template-config.js';
import { FileType, InMemoryFile } from '../parser/entities.js';
import { CodifyParser } from '../parser/index.js';
import { OsUtils } from '../utils/os-utils.js';
import { VariablePromptRequest, VariableResolver } from '../variables/variable-resolver.js';
import { TemplateExpander } from './template-expander.js';
import { ApiTemplateLoader, TemplateLoader } from './template-loader.js';

vi.mock('../api/dashboard/index.js', () => ({
  DashboardApiClient: { getTemplate: vi.fn(), getDocument: vi.fn() },
}));

/** Loads templates from an in memory map of source -> JSONC contents */
function fakeLoader(templates: Record<string, string>): TemplateLoader & { loaded: string[] } {
  const loaded: string[] = [];
  return {
    loaded,
    async load(template: TemplateConfig): Promise<InMemoryFile> {
      loaded.push(template.source);
      const contents = templates[template.source];
      if (contents === undefined) {
        throw new Error(`Unknown template ${template.source}`);
      }

      return { contents, filePath: `template:${template.source}`, fileType: FileType.JSONC };
    }
  };
}

async function expand(configs: unknown[], templates: Record<string, string>): Promise<Project> {
  const project = await CodifyParser.parseJson(configs as never);
  await new TemplateExpander(fakeLoader(templates)).expand(project);
  return project;
}

const origins = (project: Project, id: string) => project.findSpecific(...(id.split('.') as [string, string]))!
  .origins.map((o) => o.templates.map((t) => t.source).join(' > '));

describe('TemplateExpander', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('expands templates at the position they are declared', async () => {
    const project = await expand([
      { type: 'alpha' },
      { type: 'template', source: 't1' },
      { type: 'beta' },
    ], {
      t1: `[
        // comments are allowed in templates
        { "type": "gamma" },
        { "type": "delta" },
      ]`,
    });

    expect(project.templatesExpanded).toBe(true);
    expect(project.resourceConfigs.map((r) => r.id)).toEqual(['alpha', 'gamma', 'delta', 'beta']);
    expect(origins(project, 'alpha')).toEqual(['']);
    expect(origins(project, 'gamma')).toEqual(['t1']);
    expect(project.findSpecific('gamma')!.isFromTemplatesOnly).toBe(true);
    expect(project.findSpecific('alpha')!.isFromTemplate).toBe(false);
  });

  it('keeps the template position in the evaluation order unless a dependency requires a move', async () => {
    const project = await expand([
      { type: 'alpha' },
      { type: 'template', source: 't1' },
      { type: 'beta' },
      { type: 'omega' },
    ], {
      t1: '[{ "type": "gamma" }, { "type": "delta", "dependsOn": ["omega"] }]',
    });

    project.resolveDependenciesAndCalculateEvalOrder();
    expect(project.evaluationOrder).toEqual(['alpha', 'gamma', 'beta', 'omega', 'delta']);
  });

  it('applies the dependsOn of a template declaration to every resource inside it', async () => {
    const project = await expand([
      { type: 'alpha' },
      { type: 'template', name: 'node', source: 't1', dependsOn: ['omega'] },
      { type: 'omega' },
      { type: 'beta', dependsOn: ['template.node'] },
    ], {
      t1: '[{ "type": "gamma" }, { "type": "delta" }]',
    });

    project.resolveDependenciesAndCalculateEvalOrder();
    expect(project.findSpecific('gamma')!.dependencyIds).toEqual(['omega']);
    expect(project.findSpecific('gamma')!.dependsOn).toEqual([]);
    expect(project.findSpecific('beta')!.dependencyIds).toEqual(['gamma', 'delta']);
    expect(project.evaluationOrder).toEqual(['alpha', 'omega', 'gamma', 'delta', 'beta']);
  });

  it('resolves template references by type and by name', async () => {
    const project = await expand([
      { type: 'template', name: 'node', source: 't1' },
      { type: 'beta', dependsOn: ['node'] },
      { type: 'zeta', dependsOn: ['template'] },
    ], {
      t1: '[{ "type": "gamma" }]',
    });

    project.resolveDependenciesAndCalculateEvalOrder();
    expect(project.findSpecific('beta')!.dependencyIds).toEqual(['gamma']);
    expect(project.findSpecific('zeta')!.dependencyIds).toEqual(['gamma']);
  });

  it('ignores self references from a template dependsOn', async () => {
    // The template installs homebrew and depends on homebrew: only the other resources depend on it
    const project = await expand([
      { type: 'template', source: 't1', dependsOn: ['homebrew'] },
    ], {
      t1: '[{ "type": "homebrew" }, { "type": "nvm" }]',
    });

    project.resolveDependenciesAndCalculateEvalOrder();
    expect(project.findSpecific('homebrew')!.dependencyIds).toEqual([]);
    expect(project.findSpecific('nvm')!.dependencyIds).toEqual(['homebrew']);
  });

  it('expands nested templates', async () => {
    const project = await expand([
      { type: 'template', source: 'outer' },
      { type: 'beta' },
    ], {
      outer: '[{ "type": "gamma" }, { "type": "template", "source": "inner" }, { "type": "delta" }]',
      inner: '[{ "type": "epsilon" }]',
    });

    expect(project.resourceConfigs.map((r) => r.id)).toEqual(['gamma', 'epsilon', 'delta', 'beta']);
    expect(origins(project, 'epsilon')).toEqual(['outer > inner']);
  });

  it('allows cycles and only adds each resource once', async () => {
    const loader = fakeLoader({
      a: '[{ "type": "alpha" }, { "type": "template", "source": "b" }]',
      b: '[{ "type": "beta" }, { "type": "template", "source": "a" }]',
    });
    const project = await CodifyParser.parseJson([{ type: 'template', source: 'a' }] as never);
    await new TemplateExpander(loader).expand(project);

    expect(project.resourceConfigs.map((r) => r.id)).toEqual(['alpha', 'beta']);
    expect(loader.loaded).toEqual(['a', 'b']);
  });

  it('adds a template once when it is included multiple times and records every origin', async () => {
    const loader = fakeLoader({
      t1: '[{ "type": "template", "source": "shared" }]',
      t2: '[{ "type": "template", "source": "shared" }, { "type": "beta" }]',
      shared: '[{ "type": "alpha" }]',
    });
    const project = await CodifyParser.parseJson([
      { type: 'template', source: 't1' },
      { type: 'template', source: 't2', dependsOn: ['omega'] },
      { type: 'omega' },
    ] as never);
    await new TemplateExpander(loader).expand(project);

    expect(project.resourceConfigs.map((r) => r.id)).toEqual(['alpha', 'beta', 'omega']);
    expect(loader.loaded).toEqual(['t1', 'shared', 't2']);
    expect(origins(project, 'alpha')).toEqual(['t1 > shared', 't2 > shared']);
    // The dependsOn of the second inclusion applies as well
    expect(project.findSpecific('alpha')!.inheritedDependsOn).toEqual(['omega']);
  });

  it('filters template resources using the os of the template declaration', async () => {
    vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.LINUX);

    const project = await expand([
      { type: 'template', name: 'mac', source: 'mac-only', os: ['macOS'] },
      { type: 'template', source: 'both' },
      { type: 'beta', dependsOn: ['template.mac'] },
    ], {
      'mac-only': '[{ "type": "alpha" }, { "type": "template", "source": "both" }]',
      both: '[{ "type": "gamma" }, { "type": "delta", "os": ["macOS"] }]',
    });

    // gamma is included through mac-only (filtered out) and directly (kept)
    expect(origins(project, 'gamma')).toEqual(['mac-only > both', 'both']);

    project.removeResourcesUsingOsFilter();
    expect(project.resourceConfigs.map((r) => r.id)).toEqual(['gamma', 'beta']);
    expect(origins(project, 'gamma')).toEqual(['both']);

    // A reference to a template whose resources were all filtered out is still valid
    project.resolveDependenciesAndCalculateEvalOrder();
    expect(project.findSpecific('beta')!.dependencyIds).toEqual([]);
  });

  it('throws for references to templates that do not exist', async () => {
    const project = await expand([
      { type: 'beta', dependsOn: ['template.missing'] },
    ], {});

    expect(() => project.resolveDependenciesAndCalculateEvalOrder()).toThrow(/template.missing/);
  });

  it('does not allow templates to declare plugins', async () => {
    await expect(expand([{ type: 'template', source: 't1' }], {
      t1: '[{ "type": "project", "plugins": { "evil": "https://evil.com/plugin.js" } }, { "type": "alpha" }]',
    })).rejects.toThrow(TemplateError);

    // A project block without plugins is ignored
    const project = await expand([{ type: 'template', source: 't1' }], {
      t1: '[{ "type": "project", "description": "My template" }, { "type": "alpha" }]',
    });
    expect(project.projectConfig).toBeNull();
    expect(project.resourceConfigs.map((r) => r.id)).toEqual(['alpha']);
  });

  it('validates template declarations', async () => {
    await expect(CodifyParser.parseJson([{ type: 'template' }] as never)).rejects.toThrow(/invalid template config/);
    await expect(CodifyParser.parseJson([{ type: 'template', source: './local/codify.jsonc' }] as never)).rejects.toThrow(/invalid template config/);
  });

  it('keeps the resources of projects without templates', async () => {
    const loader = fakeLoader({});
    const project = await CodifyParser.parseJson([{ type: 'alpha' }, { type: 'beta', name: 'b' }] as never);
    const resources = [...project.resourceConfigs];
    await new TemplateExpander(loader).expand(project);

    expect(project.resourceConfigs).toEqual(resources);
    expect(loader.loaded).toEqual([]);
  });
});

describe('TemplateExpander variables', () => {
  /** Expands with a prompter that answers by qualified name (ex: astro.projectName) */
  async function expandWithAnswers(configs: unknown[], templates: Record<string, string>, given: Record<string, unknown>) {
    const asked: VariablePromptRequest[] = [];
    const loader = fakeLoader(templates);
    const resolver = new VariableResolver(async (request) => {
      asked.push(request);
      return given[VariableResolver.qualifiedName(request.scope, request.name)];
    });

    const project = await CodifyParser.parseJson(configs as never);
    await new TemplateExpander(loader).expand(project, resolver);
    return { project, asked: asked.map((r) => VariableResolver.qualifiedName(r.scope, r.name)), loader, resolver };
  }

  const site = `[
    { "type": "variable", "name": "projectName" },
    { "type": "git-repository", "directory": "~/projects/\${{ projectName }}" },
  ]`;

  it('asks for the variables of the project, then the variables of each template (scoped to the template)', async () => {
    const { project, asked, loader } = await expandWithAnswers([
      { type: 'variable', name: 'siteType', valueType: 'enum', options: ['blog', 'portfolio'] },
      { type: 'template', source: '@codify/blog', when: { siteType: 'blog' } },
      { type: 'template', source: '@codify/portfolio', when: { siteType: 'portfolio' } },
      { type: 'npm', name: 'n', when: { siteType: 'portfolio' } },
    ], {
      '@codify/blog': site,
      '@codify/portfolio': site,
    }, { siteType: 'blog', 'blog.projectName': 'my-blog' });

    expect(asked).toEqual(['siteType', 'blog.projectName']);
    // Templates whose condition doesn't match are never loaded
    expect(loader.loaded).toEqual(['@codify/blog']);
    expect(project.resourceConfigs.map((r) => [r.id, r.parameters])).toEqual([
      ['git-repository', { directory: '~/projects/my-blog' }],
    ]);
  });

  it('passes values to the variables of a template', async () => {
    const { project, asked } = await expandWithAnswers([
      { type: 'variable', name: 'name' },
      { type: 'template', source: '@codify/site', variables: { projectName: '${{ name }}-site' } },
    ], { '@codify/site': site }, { name: 'kevin' });

    expect(asked).toEqual(['name']);
    expect(project.resourceConfigs[0].parameters).toEqual({ directory: '~/projects/kevin-site' });
  });

  it('expands a template again when it is included with other values', async () => {
    const { project, asked, loader } = await expandWithAnswers([
      { type: 'template', name: 'a', source: '@codify/site', variables: { projectName: 'one' } },
      { type: 'template', name: 'b', source: '@codify/site', variables: { projectName: 'two' } },
      { type: 'template', name: 'c', source: '@codify/site', variables: { projectName: 'one' } },
    ], { '@codify/site': site }, {});

    expect(asked).toEqual([]);
    // Fetched once
    expect(loader.loaded).toEqual(['@codify/site']);
    // Duplicates get unique names when the plugins are initialized (TemplateResourceMerger)
    expect(project.resourceConfigs.map((r) => r.parameters.directory)).toEqual(['~/projects/one', '~/projects/two']);
  });

  it('labels templates by name or source and numbers repeated labels', async () => {
    const { asked } = await expandWithAnswers([
      { type: 'template', source: '@codify/site' },
      { type: 'template', source: '@other/site', variables: { projectName: 'x' } },
      { type: 'template', source: 'site', name: 'named', variables: { projectName: 'y' } },
      { type: 'template', source: 'nested' },
    ], {
      '@codify/site': site,
      '@other/site': site,
      site,
      nested: `[{ "type": "template", "source": "deep" }]`,
      deep: site,
    }, { 'site.projectName': 'a', 'nested.deep.projectName': 'b' });

    expect(asked).toEqual(['site.projectName', 'nested.deep.projectName']);
  });

  it('removes dependsOn references to resources that were removed by a condition', async () => {
    const { project } = await expandWithAnswers([
      { type: 'variable', name: 'useBrew', valueType: 'boolean' },
      { type: 'homebrew', when: { useBrew: true } },
      { type: 'template', name: 'extras', source: 'extras', when: { useBrew: true } },
      { type: 'nvm', dependsOn: ['homebrew', 'template.extras'] },
    ], { extras: '[{ "type": "alpha" }]' }, { useBrew: false });

    expect(project.resourceConfigs.map((r) => r.id)).toEqual(['nvm']);
    expect(project.resourceConfigs[0].dependsOn).toEqual(['template.extras']);

    project.resolveDependenciesAndCalculateEvalOrder();
    expect(project.evaluationOrder).toEqual(['nvm']);
  });

  it('reports undeclared variables', async () => {
    const { project, asked } = await expandWithAnswers([
      { type: 'npm', token: '${{ token }}' },
      { type: 'template', source: 'site' },
    ], { site: '[{ "type": "alpha", "a": "${{ other }}" }]' }, { token: 't', 'site.other': 'o' });

    expect(asked).toEqual(['token', 'site.other']);
    expect(project.implicitVariables).toEqual(['token', 'site.other']);
  });

  it('resolves the variables of the project without expanding templates', async () => {
    const project = await CodifyParser.parseJson([
      { type: 'variable', name: 'os', valueType: 'enum', options: ['mac', 'linux'] },
      { type: 'brew', when: { os: 'mac' }, formulae: ['${{ os }}'] },
      { type: 'apt', when: { os: 'linux' } },
      { type: 'template', source: 'site', when: { os: 'linux' } },
    ] as never);

    await TemplateExpander.resolveProjectVariables(project, new VariableResolver(async () => 'mac'));
    expect(project.resourceConfigs.map((r) => [r.id, r.parameters])).toEqual([['brew', { formulae: ['mac'] }]]);
    expect(project.templateConfigs).toHaveLength(1);
  });
});

describe('ApiTemplateLoader', () => {
  const registryTemplate = {
    id: 't-1',
    name: 'nvm',
    displayName: 'NVM',
    description: null,
    rawConfigs: '[{ "type": "nvm" }]',
  };

  afterEach(() => {
    vi.mocked(DashboardApiClient.getTemplate).mockReset();
  });

  it('loads registry templates by name or @profile/name', async () => {
    vi.mocked(DashboardApiClient.getTemplate).mockResolvedValue(registryTemplate);
    const loader = new ApiTemplateLoader();

    const file = await loader.load(new TemplateConfig({ type: 'template', source: '@codify/nvm' }));
    expect(DashboardApiClient.getTemplate).toHaveBeenCalledWith('@codify/nvm');
    expect(file).toEqual({ contents: registryTemplate.rawConfigs, filePath: 'template:@codify/nvm', fileType: FileType.JSONC });
  });

  it('uses templates that were already fetched', async () => {
    const loader = new ApiTemplateLoader();
    loader.seed('nvm', registryTemplate);

    await loader.load(new TemplateConfig({ type: 'template', source: 'nvm' }));
    expect(DashboardApiClient.getTemplate).not.toHaveBeenCalled();
  });

  it('throws when the template does not exist', async () => {
    vi.mocked(DashboardApiClient.getTemplate).mockResolvedValue(null);
    await expect(new ApiTemplateLoader().load(new TemplateConfig({ type: 'template', source: 'missing' })))
      .rejects.toThrow(/No template with this name/);
  });

  it('names the template when the registry cannot be reached', async () => {
    vi.mocked(DashboardApiClient.getTemplate).mockRejectedValue(new Error('fetch failed'));
    await expect(new ApiTemplateLoader().load(new TemplateConfig({ type: 'template', source: '@codify/nvm' })))
      .rejects.toThrow(/Unable to fetch the template from the Codify registry: fetch failed/);
  });

  it('only uses a seeded template once', async () => {
    vi.mocked(DashboardApiClient.getTemplate).mockResolvedValue(registryTemplate);
    const loader = new ApiTemplateLoader();
    loader.seed('nvm', registryTemplate);

    await loader.load(new TemplateConfig({ type: 'template', source: 'nvm' }));
    await loader.load(new TemplateConfig({ type: 'template', source: 'nvm' }));
    expect(DashboardApiClient.getTemplate).toHaveBeenCalledTimes(1);
  });

  it('does not support versions yet', async () => {
    await expect(new ApiTemplateLoader().load(new TemplateConfig({ type: 'template', source: 'nvm', version: '1.0.0' })))
      .rejects.toThrow(/versions are not supported/);
    expect(DashboardApiClient.getTemplate).not.toHaveBeenCalled();
  });
});
