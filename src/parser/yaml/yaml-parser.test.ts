import { describe, expect, it } from 'vitest';
import { YamlParser } from './yaml-parser.js';
import { FileType, InMemoryFile } from '../entities.js';

describe('YamlParser tests', () => {
  it('Can parse yaml files', () => {
    const yaml = `
- type: project
  plugins:
    default: "../homebrew-plugin/src/index.ts"
- type: nvm
  global: '18.20'
  nodeVersions:
  - '18.20'
- type: homebrew
  formulae:
  - cirruslabs/cli/cirrus
  - cirruslabs/cli/tart
- type: vscode
`

    const file: InMemoryFile = {
      filePath: '/path/to/test.yaml',
      fileType: FileType.YAML,
      contents: yaml,
    }

    const parser = new YamlParser()
    const result = parser.parse(file);

    console.log(result);

    expect(result.length).to.eq(4);
    expect(result[0]).toMatchObject({
      contents: { type: 'project', plugins: { default: '../homebrew-plugin/src/router.ts' }},
    })

  })

})
