import { vol } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockReporter } from '../../test/orchestrator/mocks/reporter.js';
import { DashboardApiClient } from '../api/dashboard/index.js';
import { NoCodifyFilesError } from '../common/errors.js';
import { LoginHelper } from '../connect/login-helper.js';
import { CodifyResolver, CodifySourceType } from './resolver.js';

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
});

vi.mock('../api/dashboard/index.js', () => ({
  DashboardApiClient: {
    getTemplate: vi.fn(),
    getDefaultDocumentId: vi.fn(),
  },
}));

vi.mock('../connect/login-helper.js', () => ({
  LoginHelper: { get: vi.fn(() => ({ isLoggedIn: false })) },
}));

const template = { id: 't1', name: 'nvm', displayName: 'NVM', description: null, rawConfigs: '[]' };

describe('CodifyResolver', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
    vol.fromJSON({ '/project/.keep': '' });
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('resolves a UUID to a remote document without touching the file system', async () => {
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const result = await CodifyResolver.resolve({ location: id }, new MockReporter());

    expect(result).toEqual({ type: CodifySourceType.REMOTE, documentId: id });
  });

  it('resolves an explicit file path', async () => {
    vol.fromJSON({ '/project/setup.codify.jsonc': '[]' });
    const result = await CodifyResolver.resolve({ location: '/project/setup.codify.jsonc' }, new MockReporter());

    expect(result).toEqual({ type: CodifySourceType.LOCAL, path: '/project/setup.codify.jsonc' });
  });

  it('resolves the single codify file in the current directory to an absolute path', async () => {
    vol.fromJSON({ '/project/codify.jsonc': '[]', '/project/README.md': '' });
    const result = await CodifyResolver.resolve({}, new MockReporter());

    expect(result).toEqual({ type: CodifySourceType.LOCAL, path: '/project/codify.jsonc' });
  });

  it('prompts the user when a directory has multiple codify files', async () => {
    vol.fromJSON({ '/project/a.codify.jsonc': '[]', '/project/b.codify.yaml': '' });
    const promptOptions = vi.fn(() => 1);

    const result = await CodifyResolver.resolve({}, new MockReporter({ promptOptions }));

    expect(promptOptions).toHaveBeenCalledWith(expect.any(String), ['a.codify.jsonc', 'b.codify.yaml']);
    expect(result).toEqual({ type: CodifySourceType.LOCAL, path: '/project/b.codify.yaml' });
  });

  it('resolves a template by name when templates are allowed', async () => {
    vi.mocked(DashboardApiClient.getTemplate).mockResolvedValue(template);
    const result = await CodifyResolver.resolve({ location: 'nvm', allowTemplates: true }, new MockReporter());

    expect(DashboardApiClient.getTemplate).toHaveBeenCalledWith('nvm');
    expect(result).toEqual({ type: CodifySourceType.TEMPLATE, template, location: 'nvm' });
  });

  it('prefers a local directory over a template with the same name', async () => {
    vol.fromJSON({ '/project/nvm/codify.jsonc': '[]' });
    const result = await CodifyResolver.resolve({ location: 'nvm', allowTemplates: true }, new MockReporter());

    expect(DashboardApiClient.getTemplate).not.toHaveBeenCalled();
    expect(result).toEqual({ type: CodifySourceType.LOCAL, path: '/project/nvm/codify.jsonc' });
  });

  it('does not look up templates unless allowed', async () => {
    await expect(CodifyResolver.resolve({ location: 'nvm' }, new MockReporter()))
      .rejects.toThrow(NoCodifyFilesError);
    expect(DashboardApiClient.getTemplate).not.toHaveBeenCalled();
  });

  it('throws NoCodifyFilesError when the template does not exist', async () => {
    vi.mocked(DashboardApiClient.getTemplate).mockResolvedValue(null);

    await expect(CodifyResolver.resolve({ location: 'does-not-exist', allowTemplates: true }, new MockReporter()))
      .rejects.toThrow('No Codify file, directory, or template found matching "does-not-exist"');
  });

  it('throws NoCodifyFilesError with usage help for an empty directory', async () => {
    const error = await CodifyResolver.resolve({}, new MockReporter()).catch((e) => e);

    expect(error).toBeInstanceOf(NoCodifyFilesError);
    expect(error.message).toBe('No Codify files found in /project');
    expect(error.formattedMessage()).toContain('codify apply <template name>');
  });

  it('returns null for an empty directory when allowEmpty is set', async () => {
    const result = await CodifyResolver.resolve({ allowEmpty: true }, new MockReporter());
    expect(result).toBeNull();
  });

  it('falls back to the default dashboard document when logged in', async () => {
    vi.mocked(LoginHelper.get).mockReturnValue({ isLoggedIn: true } as LoginHelper);
    vi.mocked(DashboardApiClient.getDefaultDocumentId).mockResolvedValue('doc-id');

    const result = await CodifyResolver.resolve({}, new MockReporter());

    expect(result).toEqual({ type: CodifySourceType.REMOTE, documentId: 'doc-id' });
  });
});

describe('CodifyResolver.resolveTargets', () => {
  const resourceTypes = ['nvm', 'pyenv', 'homebrew', 'docker'];
  const jsEssentials = { ...template, id: 't2', name: '@codifycli/js-essentials' };
  let getResourceTypes: ReturnType<typeof vi.fn<() => Promise<string[]>>>;

  const resolveTargets = (targets: string[], kind?: 'resource' | 'template') =>
    CodifyResolver.resolveTargets({ targets, kind, getResourceTypes }, new MockReporter());

  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
    vol.fromJSON({ '/project/.keep': '' });
    getResourceTypes = vi.fn(async () => resourceTypes);
    vi.mocked(DashboardApiClient.getTemplate).mockImplementation(async (name: string) => {
      if (name === 'nvm') return template;
      if (name === '@codifycli/js-essentials') return jsEssentials;
      return null;
    });
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('resolves resource types', async () => {
    const result = await resolveTargets(['pyenv', 'homebrew', 'pyenv']);

    expect(result).toEqual({ type: CodifySourceType.RESOURCES, resourceTypes: ['pyenv', 'homebrew'], templateNameClashes: [] });
  });

  it('prefers a resource type over a template with the same name and reports the clash', async () => {
    const result = await resolveTargets(['nvm', 'pyenv']);

    expect(result).toEqual({ type: CodifySourceType.RESOURCES, resourceTypes: ['nvm', 'pyenv'], templateNameClashes: ['nvm'] });
  });

  it('ignores errors of the template lookup when the targets are resource types (ex: offline)', async () => {
    vi.mocked(DashboardApiClient.getTemplate).mockRejectedValue(new Error('offline'));
    const result = await resolveTargets(['nvm']);

    expect(result).toEqual({ type: CodifySourceType.RESOURCES, resourceTypes: ['nvm'], templateNameClashes: [] });
  });

  it('resolves a scoped template without starting the plugins', async () => {
    const result = await resolveTargets(['@codifycli/js-essentials']);

    expect(getResourceTypes).not.toHaveBeenCalled();
    expect(result).toEqual({ type: CodifySourceType.TEMPLATE, template: jsEssentials, location: '@codifycli/js-essentials' });
  });

  it('resolves a bare template name that is not a resource type', async () => {
    const other = { ...template, name: 'web-dev' };
    vi.mocked(DashboardApiClient.getTemplate).mockResolvedValue(other);

    expect(await resolveTargets(['web-dev'])).toEqual({ type: CodifySourceType.TEMPLATE, template: other, location: 'web-dev' });
  });

  it('prefers a directory with codify files over a resource type with the same name', async () => {
    vol.fromJSON({ '/project/nvm/codify.jsonc': '[]' });
    const result = await resolveTargets(['nvm']);

    expect(getResourceTypes).not.toHaveBeenCalled();
    expect(result).toEqual({ type: CodifySourceType.LOCAL, path: '/project/nvm/codify.jsonc' });
  });

  it('does not treat a directory without codify files as a file target', async () => {
    vol.fromJSON({ '/project/docker/Dockerfile': '' });
    const result = await resolveTargets(['docker']);

    expect(result).toMatchObject({ type: CodifySourceType.RESOURCES, resourceTypes: ['docker'] });
  });

  it('resolves paths and document ids as files', async () => {
    vol.fromJSON({ '/project/setup.codify.jsonc': '[]' });
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    expect(await resolveTargets(['./setup.codify.jsonc'])).toEqual({ type: CodifySourceType.LOCAL, path: '/project/setup.codify.jsonc' });
    expect(await resolveTargets([id])).toEqual({ type: CodifySourceType.REMOTE, documentId: id });
    await expect(resolveTargets(['./missing.jsonc'])).rejects.toThrow(NoCodifyFilesError);
    expect(getResourceTypes).not.toHaveBeenCalled();
  });

  it('does not mix resource types and templates', async () => {
    await expect(resolveTargets(['nvm', '@codifycli/js-essentials']))
      .rejects.toThrow('Resources and templates can\'t be applied together: "nvm" is a resource type and "@codifycli/js-essentials" is a template.');
  });

  it('does not combine a file with other targets', async () => {
    vol.fromJSON({ '/project/setup.codify.jsonc': '[]' });

    await expect(resolveTargets(['./setup.codify.jsonc', 'nvm']))
      .rejects.toThrow('"./setup.codify.jsonc" is a codify file and can\'t be combined with other arguments ("nvm")');
    await expect(resolveTargets(['a.jsonc', 'b.jsonc']))
      .rejects.toThrow('Only one codify file can be applied at a time. Received: "a.jsonc", "b.jsonc".');
  });

  it('only applies one template at a time', async () => {
    vi.mocked(DashboardApiClient.getTemplate).mockResolvedValue(template);

    await expect(resolveTargets(['@a/one', '@a/two'])).rejects.toThrow('Only one template can be applied at a time');
  });

  it('suggests a resource type for a typo', async () => {
    await expect(resolveTargets(['pyenvv']))
      .rejects.toThrow('No Codify file, directory, resource type or template found matching "pyenvv". Did you mean "pyenv"?');
  });

  it('reports a typo before reporting a mix of kinds', async () => {
    await expect(resolveTargets(['nvm', 'pyenvv'])).rejects.toThrow('Did you mean "pyenv"?');
  });

  describe('--resource', () => {
    it('reads every target as a resource type without looking up templates or files', async () => {
      vol.fromJSON({ '/project/nvm/codify.jsonc': '[]' });
      const result = await resolveTargets(['nvm', 'pyenv'], 'resource');

      expect(DashboardApiClient.getTemplate).not.toHaveBeenCalled();
      expect(result).toEqual({ type: CodifySourceType.RESOURCES, resourceTypes: ['nvm', 'pyenv'], templateNameClashes: [] });
    });

    it('rejects unknown resource types', async () => {
      await expect(resolveTargets(['homebrw'], 'resource'))
        .rejects.toThrow('"homebrw" is not a resource type supported by the plugins. Did you mean "homebrew"?');
    });
  });

  describe('--template', () => {
    it('reads the target as a template even when it is a resource type', async () => {
      const result = await resolveTargets(['nvm'], 'template');

      expect(getResourceTypes).not.toHaveBeenCalled();
      expect(result).toEqual({ type: CodifySourceType.TEMPLATE, template, location: 'nvm' });
    });

    it('only accepts one template', async () => {
      await expect(resolveTargets(['nvm', 'pyenv'], 'template')).rejects.toThrow('Only one template can be applied at a time');
    });

    it('throws when the template does not exist', async () => {
      await expect(resolveTargets(['pyenv'], 'template')).rejects.toThrow('No template named "pyenv" was found in the Codify registry.');
    });
  });
});
