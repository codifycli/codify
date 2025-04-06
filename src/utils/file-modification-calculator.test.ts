import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { FileModificationCalculator, ModificationType } from './file-modification-calculator.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ResourceInfo } from '../entities/resource-info.js';
import { CodifyParser } from '../parser/index.js';
import { Project } from '../entities/project';

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

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource,
    }], match)

    console.log(result.newFile)
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

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.DELETE,
      resource: modifiedResource,
    }], match)

    expect(result.newFile).to.eq('[\n' +
      '  {\n' +
      '    "type": "project",\n' +
      '    "plugins": {\n' +
      '      "default": "latest"\n' +
      '    }\n' +
      '  }\n' +
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

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.DELETE,
      resource: modifiedResource,
    }], match)

    expect(result.newFile).to.eq('[\n' +
      '  {\n' +
      '    "type": "project",\n' +
      '    "plugins": {\n' +
      '      "default": "latest"\n' +
      '    }\n' +
      '  }\n' +
      ']',)
    console.log(result)
    console.log(result.diff)
  })

  it('Can delete a resource from an existing config 3 (with proper commas)', async () => {
    const existingFile =
      `[
  { "type": "resource2", "param2": ["a", "b", "c"] }, { "type": "resource1", "param2": ["a", "b", "c"] }, {
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

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.DELETE,
      resource: modifiedResource,
    }], match)

    expect(result.newFile).to.eq('[\n' +
      '  { "type": "resource2", "param2": ["a", "b", "c"] },\n' +
      '  {\n' +
      '    "type": "project",\n' +
      '    "plugins": {\n' +
      '      "default": "latest"\n' +
      '    }\n' +
      '  }\n' +
      ']')
    console.log(result)
    console.log(result.diff)
  })

  it('Can update a resource in an existing config', async () => {
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
      r.attachResourceInfo(generateResourceInfo(r.type, ['param2']))
    });

    const modifiedResource = new ResourceConfig({
      type: 'resource1',
      param2: ['a', 'b', 'c', 'd']
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('resource1'))

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource,
    }], match)

    expect(result.newFile).to.eq('[\n' +
      '  {\n' +
      '    "type": "project",\n' +
      '    "plugins": {\n' +
      '      "default": "latest"\n' +
      '    }\n' +
      '  },\n' +
      '  { \n' +
      '    "type": "resource1",\n' +
      '    "param2": ["a", "b", "c", "d"]\n' +
      '  }\n' +
      ']',)
    console.log(result)
    console.log(result.diff)
  })

  it('Can update a resource in an existing config 2 (works between two configs)', async () => {
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
  },
  { 
    "type": "resource2",
    "param1": false,
    "param2": { "a": "aValue" },
    "param3": "this is a string"
  },
  { 
    "type": "resource3",
    "param1": "param3",
    "param2": [
      "a",
      "b"
    ]
  }
]`
    generateTestFile(existingFile);

    const project = await CodifyParser.parse(defaultPath)
    project.resourceConfigs.forEach((r) => {
      switch (r.type) {
        case 'resource1': {
          r.attachResourceInfo(generateResourceInfo(r.type, ['param2']))
          break;
        }
        case 'resource2': {
          r.attachResourceInfo(generateResourceInfo(r.type, ['param1']))
          break;
        }
        case 'resource3': {
          r.attachResourceInfo(generateResourceInfo(r.type, ['param2']))
          break;
        }
      }
    });

    const modifiedResource = new ResourceConfig({
      type: 'resource2',
      param1: false,
      param3: "this is another string",
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('resource2', ['param1']))

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource,
    }], match)

    expect(result.newFile).to.eq('[\n' +
      '  {\n' +
      '    "type": "project",\n' +
      '    "plugins": {\n' +
      '      "default": "latest"\n' +
      '    }\n' +
      '  },\n' +
      '  { \n' +
      '    "type": "resource1",\n' +
      '    "param2": ["a", "b", "c"]\n' +
      '  },\n' +
      '  { \n' +
      '    "type": "resource2",\n' +
      '    "param1": false,\n' +
      '    "param3": "this is another string"\n' +
      '  },\n' +
      '  { \n' +
      '    "type": "resource3",\n' +
      '    "param1": "param3",\n' +
      '    "param2": [\n' +
      '      "a",\n' +
      '      "b"\n' +
      '    ]\n' +
      '  }\n' +
      ']')
    console.log(result)
    console.log(result.diff)
  })

  it('Can insert a new resource in an existing config', async () => {
    const existingFile =
`[
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
      r.attachResourceInfo(generateResourceInfo(r.type, ['param2']))
    });

    const modifiedResource = new ResourceConfig({
      type: 'resource1',
      param2: ['a', 'b', 'c', 'd']
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('resource1'))

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource,
    }], match)

    expect(result.newFile).to.eq('[\n' +
      '  {\n' +
      '    "type": "project",\n' +
      '    "plugins": {\n' +
      '      "default": "latest"\n' +
      '    }\n' +
      '  },\n' +
      '  {\n' +
      '    "type": "resource1",\n' +
      '    "param2": ["a", "b", "c", "d"],\n' +
      '  }\n' +
      ']')
    console.log(result)
    console.log(result.diff)
  })

  it('Can insert a new resource in an existing config 2 (multiple)', async () => {
    const existingFile =
      `[
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
      r.attachResourceInfo(generateResourceInfo(r.type, ['param2']))
    });

    const modifiedResource = new ResourceConfig({
      type: 'resource1',
      param2: ['a', 'b', 'c', 'd']
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('resource1'))

    const modifiedResource2 = new ResourceConfig({
      type: 'resource2',
      param2: ['a', 'b', 'c', 'd']
    })
    modifiedResource2.attachResourceInfo(generateResourceInfo('resource2'))

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource,
    }, {
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource2,
    }], match)

    expect(result.newFile).to.eq('[\n' +
      '  {\n' +
      '    "type": "project",\n' +
      '    "plugins": {\n' +
      '      "default": "latest"\n' +
      '    }\n' +
      '  },\n' +
      '  {\n' +
      '    "type": "resource1",\n' +
      '    "param2": ["a", "b", "c", "d"],\n' +
      '  },\n' +
      '  {\n' +
      '    "type": "resource2",\n' +
      '    "param2": ["a", "b", "c", "d"],\n' +
      '  }\n' +
      ']',)
    console.log(result)
    console.log(result.diff)
  })

  it('Can handle an update with a single element', async () => {
    const existingFile =
`[
  {
    "type": "jenv",
    "add": [
      "system",
      "11",
      "17",
      "17.0.12",
      "openjdk64-11.0.24",
      "openjdk64-17.0.12"
    ],
    "global": "17"
  }
]
`
    generateTestFile(existingFile);

    const project = await CodifyParser.parse(defaultPath)
    project.resourceConfigs.forEach((r) => {
      r.attachResourceInfo(generateResourceInfo(r.type, []))
    });

    const modifiedResource = new ResourceConfig({
      "type": "jenv",
      "add": [
        "system",
        "11",
        "11.0",
        "11.0.24",
        "17",
        "17.0.12",
        "openjdk64-11.0.24",
        "openjdk64-17.0.12"
      ],
      "global": "17"
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('jenv'))

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource,
    }], match)

    // TODO: The result is currently wrong need to fix
    console.log(result);
    console.log(result.diff);

    expect(result.newFile).to.eq(
      '[\n' +
      '  {\n' +
      '    "type": "jenv",\n' +
      '    "add": [\n' +
      '      "system",\n' +
      '      "11",\n' +
      '      "11.0",\n' +
      '      "11.0.24",\n' +
      '      "17",\n' +
      '      "17.0.12",\n' +
      '      "openjdk64-11.0.24",\n' +
      '      "openjdk64-17.0.12"\n' +
      '    ],\n' +
      '    "global": "17"\n' +
      '  }\n' +
      ']\n',
    )
  })

  it('Can handle comments inside a .json5 file', async () => {
    const existingFile =
      `[
  // I am a comment
  /*
  I am a multi-line comment
  */
  {
    "type": "jenv",
    "add": [
      "system",
      "11",
      "17", // Line comment
      "17.0.12", // Line comment
      "openjdk64-11.0.24",
      "openjdk64-17.0.12"
    ],
    "global": "17"
  }
]
`
    generateTestFile(existingFile, '/codify.json5');

    const project = await CodifyParser.parse('/codify.json5')
    project.resourceConfigs.forEach((r) => {
      r.attachResourceInfo(generateResourceInfo(r.type, []))
    });

    const modifiedResource = new ResourceConfig({
      "type": "jenv",
      "add": [
        "system",
        "11",
        "11.0",
        "11.0.24",
        "17",
        "17.0.12",
        "openjdk64-11.0.24",
        "openjdk64-17.0.12"
      ],
      "global": "17"
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('jenv'))

    const calculator = new FileModificationCalculator(project);
    const result = await calculator.calculate([{
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource,
    }], match)

    console.log(result.newFile);
    console.log(result.diff)
  })

  afterEach(() => {
    vi.resetAllMocks();
  })
})

async function match(resource: ResourceConfig, array: ResourceConfig[]): Promise<number> {
  return array.findIndex((r) => resource.isSame(r.type, r.name));
}

function generateResourceInfo(type: string, requiredParameters?: string[]): ResourceInfo {
  return ResourceInfo.fromResponseData({
    plugin: 'plugin',
    type,
    importAndDestroy: { requiredParameters }
  })
}

/**
 * To generate the source maps and parsed resources it's easier to write it to the file-system and parse it for real
 */
function generateTestFile(contents: string, filePath = defaultPath): void {
  fs.writeFileSync(filePath, contents, { encoding: 'utf8' });
}
