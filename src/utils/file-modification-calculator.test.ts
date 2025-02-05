import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { FileModificationCalculator, ModificationType } from './file-modification-calculator.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ResourceInfo } from '../entities/resource-info.js';
import { CodifyParser } from '../parser/index.js';

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs
})

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
})

const defaultPath = '/codify.json'


describe('File modification calculator tests', () => {

  it('Can generate a diff and a new file', async () => {
    const existingFile =
`[
  {
		"type": "project",
		"plugins": {
			"default": "latest"
		}
	},
	{ "type": "resource1", "param2": ["a", "b", "c"]}
]`
    generateTestFile(existingFile);

    const project = await CodifyParser.parse(defaultPath)
    project.resourceConfigs.forEach((r) => {
      r.attachResourceInfo(generateResourceInfo(r.type))
    });

    const modifiedResource = new ResourceConfig({
      type: 'resource1',
      parameter1: 'abc'
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('resource1'))

    const calculator = new FileModificationCalculator(project.resourceConfigs, project.sourceMaps.getSourceMap(defaultPath).file, project.sourceMaps);
    const result = await calculator.calculate([{
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource,
    }])

    console.log(result)
    console.log(result.diff)
  })

  it('Can delete a resource from an existing config (with proper commas)', async () => {
    const existingFile =
`[
  {
    "type": "project",
    "plugins": {
      "default": "latest"
    }
  },
  { 
    "type": "resource1",
    "param2": ["a", "b", "c"]
  }
]`
    generateTestFile(existingFile);

    const project = await CodifyParser.parse(defaultPath)
    project.resourceConfigs.forEach((r) => {
      r.attachResourceInfo(generateResourceInfo(r.type))
    });

    const modifiedResource = new ResourceConfig({
      type: 'resource1',
      parameter1: 'abc'
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('resource1'))

    const calculator = new FileModificationCalculator(project.resourceConfigs, project.sourceMaps.getSourceMap(defaultPath).file, project.sourceMaps);
    const result = await calculator.calculate([{
      modification: ModificationType.DELETE,
      resource: modifiedResource,
    }])

    expect(result.newFile).to.eq('[\n' +
      '  {\n' +
      '    "type": "project",\n' +
      '    "plugins": {\n' +
      '      "default": "latest"\n' +
      '    }\n' +
      '  }\n' +
      '  \n' +
      ']')
    console.log(result)
    console.log(result.diff)
  })

  it('Can delete a resource from an existing config 2 (with proper commas)', async () => {
    const existingFile =
      `[
  { 
    "type": "resource1",
    "param2": ["a", "b", "c"]
  },
  {
    "type": "project",
    "plugins": {
      "default": "latest"
    }
  }
]`
    generateTestFile(existingFile);

    const project = await CodifyParser.parse(defaultPath)
    project.resourceConfigs.forEach((r) => {
      r.attachResourceInfo(generateResourceInfo(r.type))
    });

    const modifiedResource = new ResourceConfig({
      type: 'resource1',
      parameter1: 'abc'
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('resource1'))

    const calculator = new FileModificationCalculator(project.resourceConfigs, project.sourceMaps.getSourceMap(defaultPath).file, project.sourceMaps);
    const result = await calculator.calculate([{
      modification: ModificationType.DELETE,
      resource: modifiedResource,
    }])

    // expect(result.newFile).to.eq('[\n' +
    //   '  {\n' +
    //   '    "type": "project",\n' +
    //   '    "plugins": {\n' +
    //   '      "default": "latest"\n' +
    //   '    }\n' +
    //   '  }\n' +
    //   '  \n' +
    //   ']')
    console.log(result)
    console.log(result.diff)
  })

  afterEach(() => {
    vi.resetAllMocks();
  })
})

function generateResourceInfo(type: string, requiredParameters?: string[]): ResourceInfo {
  return ResourceInfo.fromResponseData({
    plugin: 'plugin',
    type,
    import: { requiredParameters }
  })
}

/**
 * To generate the source maps and parsed resources it's easier to write it to the file-system and parse it for real
 */
function generateTestFile(contents: string, filePath = defaultPath): void {
  fs.writeFileSync(filePath, contents, { encoding: 'utf8' });
}
