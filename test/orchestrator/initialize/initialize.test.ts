import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';

import { MockOs } from '../mocks/system';
import { PluginInitOrchestrator } from '../../../src/common/initialize-plugins';
import path from 'node:path';
import { MockReporter } from '../mocks/reporter';
import { MockResource, MockResourceConfig } from '../mocks/resource';

vi.mock('../mocks/get-mock-resources.js', async () => {
  return {
    getMockResources: () => ([
      new class extends MockResource {
        getSettings(){
          return { id: 'customType1' }
        }
      },
      new class extends MockResource {
        getSettings(){
          return { id: 'customType2' }
        }
      }
    ])
  }
})

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
})

vi.mock('fs', async () => {
  const { fs } = await import('memfs');
  return fs;
})

vi.mock('../../../src/plugins/plugin.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { Plugin: MockPlugin };
})

describe('Parser integration tests', () => {
  it('Finds the correct files to initialize and initializes all files within a folder', async () => {
    const file1Contents =
      `[
  { "type": "customType1" }
]`

    const file2Contents =
      `[
  { "type": "customType2" }
]`
    const folder = path.resolve(os.homedir(), 'Downloads', 'untitled folder')
    fs.mkdirSync(folder, { recursive: true });

    fs.writeFileSync(path.resolve(folder, 'home.codify.json'), file1Contents);
    fs.writeFileSync(path.resolve(folder, 'home-2.codify.json'), file2Contents);

    const reporter = new MockReporter({
      promptOptions: (message, options) => options.indexOf('home-2.codify.json'),
    });

    const cwdSpy = vi.spyOn(process, 'cwd');
    cwdSpy.mockReturnValue(folder);

    const { project, pluginManager, resourceDefinitions } = await PluginInitOrchestrator.run({}, reporter);

    console.log(project);
    expect(project).toMatchObject({
      codifyFiles: expect.arrayContaining([
        path.resolve(folder, 'home-2.codify.json'),
      ]),
      resourceConfigs: expect.arrayContaining([
        expect.objectContaining({
          type: 'customType2',
        })
      ])
    })
  })

  // Write test for cloud files here?

  afterEach(() => {
    vi.resetAllMocks();
    MockOs.reset();
  })
})
