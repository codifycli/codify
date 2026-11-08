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
    expect(result).toEqual({ type: CodifySourceType.TEMPLATE, template });
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
