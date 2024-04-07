import * as mock from 'mock-fs';
import { deepEqual, equal } from 'node:assert';

import { LoadedFile } from './entities/file.js';
import { ConfigLoader } from './index.js';

describe('Config loader tests', () => {
  let parser: ConfigLoader;

  before(() => {
    parser = new ConfigLoader();
  })

  it('it loads config files correctly', async () => {
    const dir = 'path/to/fake/dir';
    const config = {
      [dir]: {
        'homebrew.json': '[]',
        'nvm.json': '[]',
        'providers.json': '[]'
      }
    };
    (mock as any)(config);

    const project = await parser.loadProject(dir);

    equal(project.coreModule.files.length, 3);
    equal(project.coreModule.directory, dir);
    deepEqual(project.coreModule.files[0], new LoadedFile({
      contents: '[]',
      fileName: 'homebrew.json',
      fileType: 'json'
    }));
    deepEqual(project.coreModule.files[1], new LoadedFile({ contents: '[]', fileName: 'nvm.json', fileType: 'json' }));
    deepEqual(project.coreModule.files[2], new LoadedFile({
      contents: '[]',
      fileName: 'providers.json',
      fileType: 'json'
    }));

    mock.restore();
  })


})
