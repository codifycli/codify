import mock from 'mock-fs';
import { beforeEach, describe, it } from 'vitest';
import { deepEqual, equal } from 'node:assert';

import { File } from './entities/file.js';
import { ProjectReader } from './index.js';

describe('Config loader tests', () => {
  let parser: ProjectReader;

  beforeEach(() => {
    parser = new ProjectReader();
  })

  it('it loads config files correctly', async () => {
    const dir = 'path/to/fake/dir';
    mock({
      [dir]: {
        'homebrew.json': '[]',
        'nvm.json': '[]',
        'providers.json': '[]'
      }
    });

    const project = await parser.readProject(dir);

    equal(project.files.length, 3);
    equal(project.rootDirectory, dir);
    deepEqual(project.files[0], new File({
      contents: '[]',
      fileName: 'homebrew.json',
      fileType: 'json'
    }));
    deepEqual(project.files[1], new File({ contents: '[]', fileName: 'nvm.json', fileType: 'json' }));
    deepEqual(project.files[2], new File({
      contents: '[]',
      fileName: 'providers.json',
      fileType: 'json'
    }));

    mock.restore();
  })
})
