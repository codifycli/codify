import { describe, it, vi, afterEach } from 'vitest';
import { FileModificationCalculator, ModificationType } from './file-modification-calculator';
import { ResourceConfig } from '../entities/resource-config';
import { ResourceInfo } from '../entities/resource-info';
import { FileType, InMemoryFile } from '../parser/entities';

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs
})

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
})


describe('File modification calculator tests', () => {

  it('Can generate a diff and a new file', async () => {
    const existingResource = new ResourceConfig({
      type: 'resource1'
    });
    existingResource.attachResourceInfo(generateResourceInfo('resource1'))

    const existingFileContents =
`[
  {
    "type": "project",
    "plugins": {
      "default": "latest",
    }
  },
  { "type": "resource1" }
]`
    const existingFile = <InMemoryFile> { filePath: '/path/to/file.json', fileType: FileType.JSON, contents: existingFileContents };

    const modifiedResource = new ResourceConfig({
      type: 'resource1',
      parameter1: 'abc'
    })
    modifiedResource.attachResourceInfo(generateResourceInfo('resource1'))

    const calculator = new FileModificationCalculator([existingResource], existingFile)
    const result = await calculator.calculate([{
      modification: ModificationType.INSERT_OR_UPDATE,
      resource: modifiedResource,
    }])

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
