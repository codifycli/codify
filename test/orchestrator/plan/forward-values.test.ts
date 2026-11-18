import fs from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InitializationResult } from '../../../src/common/initialize-plugins.js';
import {
  MissingParametersResolver,
  PARAMETER_VALUES_FILE_ENV,
  ResolvedParameter,
} from '../../../src/common/resolve-missing-parameters.js';
import { PLACEHOLDER_VALUE } from '../../../src/entities/missing-parameter.js';
import { Project } from '../../../src/entities/project.js';
import { ResourceConfig } from '../../../src/entities/resource-config.js';
import { ResourceInfo } from '../../../src/entities/resource-info.js';
import { TestOrchestrator } from '../../../src/orchestrators/test.js';
import { MockReporter } from '../mocks/reporter.js';

const schema = {
  type: 'object',
  properties: { repository: { type: 'string' }, directory: { type: 'string' }, depth: { type: 'number' } },
  required: ['repository', 'directory'],
};

function initializationResult(resources: ResourceConfig[]): InitializationResult {
  return {
    project: new Project(null, resources, []),
    resourceDefinitions: new Map([['git-repository', { type: 'git-repository', dependencies: [] }]]),
    pluginManager: {
      getMultipleResourceInfo: async (types: string[]) => types.map((type) => ResourceInfo.fromResponseData({
        plugin: 'default', type, schema, allowMultiple: true,
      })),
    },
  } as unknown as InitializationResult;
}

describe('Forwarding resolved values (codify test)', () => {
  afterEach(() => {
    delete process.env[PARAMETER_VALUES_FILE_ENV];
  });

  it('Returns every value it filled in, keyed by resource id', async () => {
    // Unnamed duplicates are given unique ids by the project (git-repository.0, git-repository.1)
    const first = new ResourceConfig({ type: 'git-repository', repository: 'a', directory: '~/a' });
    const second = new ResourceConfig({ type: 'git-repository', repository: PLACEHOLDER_VALUE });
    const reporter = new MockReporter({ promptMissingParameters: () => [['b', '~/b']] });

    const resolved = await MissingParametersResolver.run(initializationResult([first, second]), reporter);

    expect(resolved).toEqual([
      { resourceId: 'git-repository.1', path: ['repository'], value: 'b' },
      { resourceId: 'git-repository.1', path: ['directory'], value: '~/b' },
    ]);
  });

  it('Uses preset values instead of prompting', async () => {
    const resource = new ResourceConfig({ type: 'git-repository', name: 'work', repository: PLACEHOLDER_VALUE });
    const promptMissingParameters = vi.fn(() => []);
    const presets: ResolvedParameter[] = [
      { resourceId: 'git-repository.work', path: ['repository'], value: 'git@github.com:org/repo.git' },
      { resourceId: 'git-repository.work', path: ['directory'], value: '~/work' },
    ];

    await MissingParametersResolver.run(initializationResult([resource]), new MockReporter({ promptMissingParameters }), presets);

    expect(promptMissingParameters).not.toHaveBeenCalled();
    expect(resource.parameters).toMatchObject({ repository: 'git@github.com:org/repo.git', directory: '~/work' });
  });

  it('Prefers the config over preset values and only prompts for what is left', async () => {
    // The user edited the config in the VM: directory is now set and depth is newly missing a value
    const resource = new ResourceConfig({ type: 'git-repository', repository: 'r', directory: '~/edited' });
    const presets: ResolvedParameter[] = [
      { resourceId: 'git-repository', path: ['directory'], value: '~/from-host' },
      // Presets for resources that no longer exist are ignored
      { resourceId: 'git-repository.removed', path: ['directory'], value: '~/x' },
    ];

    const resolved = await MissingParametersResolver.run(initializationResult([resource]), new MockReporter(), presets);

    expect(resource.parameters.directory).to.eq('~/edited');
    expect(resolved).toEqual([]);
  });

  it('Round trips values through a private temp file', async () => {
    const values: ResolvedParameter[] = [{ resourceId: 'aws-profile', path: ['awsSecretAccessKey'], value: 'secret' }];
    const { dir, file } = await MissingParametersResolver.writeValuesToTempDir(values);

    try {
      expect((await fs.stat(dir)).mode & 0o777).to.eq(0o700);
      expect((await fs.stat(file)).mode & 0o777).to.eq(0o600);

      process.env[PARAMETER_VALUES_FILE_ENV] = file;
      expect(await MissingParametersResolver.loadPresetValues()).toEqual(values);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('Round trips variables and reads the previous format (a list of parameters)', async () => {
    const parameters: ResolvedParameter[] = [{ resourceId: 'aws-profile', path: ['awsSecretAccessKey'], value: 'secret' }];
    const variables = [{ scope: ['astro'], name: 'projectName', value: 'site' }, { scope: [], name: 'port', value: 3000 }];
    const { dir, file } = await MissingParametersResolver.writeValuesToTempDir(parameters, variables);

    try {
      process.env[PARAMETER_VALUES_FILE_ENV] = file;
      expect(await MissingParametersResolver.loadPresetValues()).toEqual(parameters);
      expect(await MissingParametersResolver.loadPresetVariables()).toEqual(variables);

      await fs.writeFile(file, JSON.stringify(parameters));
      expect(await MissingParametersResolver.loadPresetValues()).toEqual(parameters);
      expect(await MissingParametersResolver.loadPresetVariables()).toEqual([]);

      await fs.writeFile(file, JSON.stringify({ variables: [{ name: 'a' }] }));
      await expect(MissingParametersResolver.loadPresetVariables()).rejects.toThrow('Invalid parameter values file');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('Loads nothing when the env var is not set and rejects invalid files', async () => {
    expect(await MissingParametersResolver.loadPresetValues()).toEqual([]);

    const { dir, file } = await MissingParametersResolver.writeValuesToTempDir([]);
    try {
      await fs.writeFile(file, JSON.stringify({ not: 'a list' }));
      process.env[PARAMETER_VALUES_FILE_ENV] = file;
      await expect(MissingParametersResolver.loadPresetValues()).rejects.toThrow('Invalid parameter values file');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('Points the VM apply to the forwarded values', () => {
    expect(TestOrchestrator.vmApplyCommand(false)).to.eq('cd ~ && codify apply');
    expect(TestOrchestrator.vmApplyCommand(true)).to.eq(
      `export ${PARAMETER_VALUES_FILE_ENV}='/Volumes/My Shared Files/codify-values/values.json' && cd ~ && codify apply`
    );
  });
});
