import mock from 'mock-fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { FileReader } from './index.js';

describe('Config loader tests', () => {
  let fileReader: FileReader;

  beforeEach(() => {
    fileReader = new FileReader();
  })

  it('it loads codify.json files', async () => {
    const dir = 'path/to/fake/dir';
    mock({
      [dir]: {
        'codify.json': '[]',
      }
    });

    const file = await fileReader.readConfigOrThrow(dir + '/codify.json');
    expect(file.fileName).eq('codify.json');
    expect(file.fileType).eq('json');
    expect(file.contents).eq('[]');
    mock.restore();
  })

  it('it doesn\'t load other .json files', async () => {
    const dir = 'path/to/fake/dir';
    mock({
      [dir]: {
        'other.json': '[]',
      }
    });

    expect(async () => await fileReader.readConfigOrThrow(dir + 'other.json')).to.throw;
    mock.restore();
  })

  it('it loads directories with codify.json', async () => {
    const dir = 'path/to/fake/dir';
    mock({
      [dir]: {
        'codify.json': '[]',
      }
    });

    const file = await fileReader.readConfigOrThrow(dir + '/codify.json');

    expect(file.fileName).eq('codify.json');
    expect(file.fileType).eq('json');
    expect(file.contents).eq('[]');
    mock.restore();
  })

  it('it doesn\'t load directories without codify.json', async () => {
    const dir = 'path/to/fake/dir';
    mock({
      [dir]: {
        'other.json': '[]',
      }
    });

    expect(async () => await fileReader.readConfigOrThrow(dir)).to.throw;
    mock.restore();
  })
})
