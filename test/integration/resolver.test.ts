import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

import { PluginResolver } from '../../src/plugins/resolver.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs
})

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
})

vi.mock('../../src/api/backend/index.js', async () => {
  const { fs } = await import('memfs');
  const path = await import('node:path');
  const os = await import('node:os');
  return {
    ApiClient: {
      searchPlugins: vi.fn(async () => ({
        default: { name: 'default', version: '1.0.0', downloadLink: 'https://fake/plugin.js' }
      })),
      downloadPlugin: vi.fn(async (filePath: string) => {
        const dir = path.default.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, 'export default {}');
      }),
    }
  }
})

describe('Plugin resolver integration test', () => {

  it('resolves the default plugin', async () => {
    await PluginResolver.resolveAll({ 'default': 'latest' })
    expect(fs.existsSync(path.resolve(os.homedir(), '.codify/plugins/default'))).to.be.true;

    const files = fs.readdirSync(path.resolve(os.homedir(), '.codify/plugins/default'));
    expect(files.length).to.eq(1);

    // The folder names are semver versions for the plugins (ex. 0.11.0, 0.12, etc)
    const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
    expect(semverRegex.test(files[0])).to.be.true;

    const pluginPath = path.resolve(os.homedir(), '.codify/plugins/default', files[0])
    const pluginFolder = fs.readdirSync(pluginPath)

    expect(pluginFolder.length).to.eq(1);
    expect(pluginFolder[0]).to.eq('index.js')
  })

  it ('works after .DS_store exists in the plugins folder', async() => {
    const pluginsFolder = path.resolve(os.homedir(), '.codify', 'plugins');
    fs.mkdirSync(pluginsFolder, { recursive: true });
    fs.writeFileSync(path.resolve(pluginsFolder, '.DS_store'), 'ghjh');

    await PluginResolver.resolveAll({ 'default': 'latest' })

    expect(fs.readdirSync(pluginsFolder)).toMatchObject([
      '.DS_store',
      'default'
    ])

    const versions = fs.readdirSync(path.resolve(pluginsFolder, 'default'));
    const defaultPluginFolder = path.resolve(pluginsFolder, 'default');
    expect(versions.length).to.eq(1);

    fs.rmSync(path.resolve(defaultPluginFolder, versions[0]), { recursive: true, force: true });
    fs.writeFileSync(path.resolve(defaultPluginFolder, '.DS_store'), 'ghjh');

    await PluginResolver.resolveAll({ 'default': 'latest' })
    expect(fs.readdirSync(defaultPluginFolder)).toMatchObject([
      '.DS_store',
      versions[0],
    ])
  })

  afterEach(() => {
    vi.resetAllMocks();
  })
})
