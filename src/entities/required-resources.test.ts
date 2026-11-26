import { ResourceDefinition } from '@codifycli/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { OsUtils } from '../utils/os-utils.js';
import { Project } from './project.js';
import { ResourceConfig } from './resource-config.js';

function definitions(defs: Record<string, { dependencies?: string[]; requires?: string[] }>): ResourceDefinitionMap {
  return new Map(Object.entries(defs).map(([type, d]) => [
    type,
    { type, dependencies: d.dependencies ?? [], ...('requires' in d ? { requires: d.requires } : {}) } as ResourceDefinition,
  ]));
}

function plan(defs: ResourceDefinitionMap, ...configs: ResourceConfig[]) {
  const project = new Project(null, configs, []);
  const added = project.addRequiredResources(defs);
  project.resolveDependenciesAndCalculateEvalOrder(defs);
  return { added: added.map((r) => r.id), order: project.evaluationOrder!, project };
}

const DEFS = definitions({
  'xcode-tools': { requires: [] },
  homebrew: { requires: ['xcode-tools'] },
  cursor: { requires: ['homebrew'] },
  'git-repository': { requires: ['xcode-tools'] },
  'macos-settings': { requires: [] },
  alias: { requires: [] },
});

describe('Required resources', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds nothing for resources that require nothing', () => {
    const { added, order } = plan(DEFS, new ResourceConfig({ type: 'macos-settings' }), new ResourceConfig({ type: 'alias', alias: 'll' }));

    expect(added).toEqual([]);
    expect(order).toEqual(['macos-settings', 'alias']);
  });

  it('adds required resources transitively and applies them first', () => {
    const { added, order } = plan(DEFS, new ResourceConfig({ type: 'alias' }), new ResourceConfig({ type: 'cursor' }));

    expect(added).toEqual(['homebrew', 'xcode-tools']);
    expect(order.indexOf('xcode-tools')).toBeLessThan(order.indexOf('homebrew'));
    expect(order.indexOf('homebrew')).toBeLessThan(order.indexOf('cursor'));
  });

  it('adds a required type once, even when several resources require it', () => {
    const { added, project } = plan(
      DEFS,
      new ResourceConfig({ type: 'git-repository', name: 'a' }),
      new ResourceConfig({ type: 'git-repository', name: 'b' }),
      new ResourceConfig({ type: 'homebrew' }),
    );

    expect(added).toEqual(['xcode-tools']);
    expect(project.findAll('xcode-tools')).toHaveLength(1);
    expect(project.findSpecific('git-repository', 'a')!.dependencyIds).toContain('xcode-tools');
    expect(project.findSpecific('git-repository', 'b')!.dependencyIds).toContain('xcode-tools');
  });

  it('uses the declared resource instead of adding one, and makes it a dependency', () => {
    const declaredBrew = new ResourceConfig({ type: 'homebrew', formulae: ['jq'] });
    const cursor = new ResourceConfig({ type: 'cursor' });
    const { added, order } = plan(DEFS, cursor, declaredBrew);

    expect(added).toEqual(['xcode-tools']);
    expect(cursor.dependencyIds).toEqual(['homebrew']);
    expect(order.indexOf('homebrew')).toBeLessThan(order.indexOf('cursor'));
  });

  it('ignores required types that no loaded plugin defines', () => {
    const defs = definitions({ thing: { requires: ['unknown-type'] } });
    const { added } = plan(defs, new ResourceConfig({ type: 'thing' }));

    expect(added).toEqual([]);
  });

  it('requires xcode-tools on macOS for plugins that do not send requires (built before plugin-core 2.1)', () => {
    vi.spyOn(OsUtils, 'isMacOS').mockReturnValue(true);
    const defs = definitions({ 'xcode-tools': {}, 'macos-settings': {} });

    const { added, order } = plan(defs, new ResourceConfig({ type: 'macos-settings' }));

    expect(added).toEqual(['xcode-tools']);
    expect(order).toEqual(['xcode-tools', 'macos-settings']);
  });

  it('does not add xcode-tools for older plugins on Linux', () => {
    vi.spyOn(OsUtils, 'isMacOS').mockReturnValue(false);
    const defs = definitions({ 'xcode-tools': {}, alias: {} });

    const { added } = plan(defs, new ResourceConfig({ type: 'alias' }));

    expect(added).toEqual([]);
  });
});
