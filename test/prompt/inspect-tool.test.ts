import os from 'node:os';
import { describe, expect, it } from 'vitest';

import type { PluginManager, ResourceDefinitionMap } from '../../src/plugins/plugin-manager.js';
import { inspect } from '../../src/prompt/tools/inspect-tool.js';

const thisOs = os.type();
const otherOs = thisOs === 'Darwin' ? 'Linux' : 'Darwin';

const definitions: ResourceDefinitionMap = new Map([
  ['homebrew', { type: 'homebrew', dependencies: [] }],
  ['nvm', { type: 'nvm', dependencies: [] }],
  ['pyenv', { type: 'pyenv', dependencies: [] }],
  ['broken', { type: 'broken', dependencies: [] }],
  ['other-os', { type: 'other-os', dependencies: [], operatingSystems: [otherOs] }],
  ['git-credentials', { type: 'git-credentials', dependencies: [], sensitiveParameters: ['token'] }],
  ['alias', { type: 'alias', dependencies: [], supersededBy: 'aliases' }],
  ['aliases', { type: 'aliases', dependencies: [] }],
] as any);

const machine: Record<string, Array<Record<string, unknown>>> = {
  homebrew: [{ formulae: Array.from({ length: 150 }, (_, i) => `f${i}`) }],
  nvm: [{ nodeVersions: ['20.11.0', '22.3.0'], global: '22.3.0' }],
  'git-credentials': [{ host: 'github.com', token: 'ghp_secret' }],
  alias: [{ alias: 'll' }],
  aliases: [{ aliases: [{ alias: 'll' }] }],
};

const imported: string[] = [];
const pluginManager = {
  async importResource(config: { core: { type: string } }) {
    const { type } = config.core;
    imported.push(type);
    if (type === 'broken') throw new Error('plugin crashed');
    return { request: config, result: (machine[type] ?? []).map((parameters) => ({ core: { type }, parameters })) };
  },
} as unknown as PluginManager;

describe('codify_inspect', () => {
  it('reports installed and missing types as config blocks', async () => {
    const result = await inspect(['nvm', 'pyenv', 'nope', 'other-os', 'broken'], pluginManager, definitions);

    expect(result.installed).toEqual([{ type: 'nvm', nodeVersions: ['20.11.0', '22.3.0'], global: '22.3.0' }]);
    expect(result.notInstalled).toEqual(['pyenv']);
    expect(result.unknownTypes).toEqual(['nope']);
    expect(result.unsupportedOnThisMachine).toEqual(['other-os']);
    expect(result.errors).toEqual([{ type: 'broken', error: 'plugin crashed' }]);
  });

  it('redacts sensitive parameters and shortens long arrays', async () => {
    const result = await inspect(['git-credentials', 'homebrew'], pluginManager, definitions);

    expect(result.installed[0]).toEqual({ type: 'git-credentials', host: 'github.com', token: '<redacted>' });
    expect((result.installed[1].formulae as string[]).length).toBe(100);
    expect(result.installed[1]._truncated).toMatch(/100 of 150/);
  });

  it('scans every type for this machine when no types are given, like codify init', async () => {
    imported.length = 0;
    const result = await inspect([], pluginManager, definitions);

    expect(imported.sort()).toEqual(['aliases', 'broken', 'homebrew', 'nvm', 'pyenv']);
    expect(result.installed.map((r) => r.type).sort()).toEqual(['aliases', 'homebrew', 'nvm']);
    expect(result.notInstalled).toEqual([]);
  });
});
