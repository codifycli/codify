import { describe, it } from 'vitest';
import { FileType, InMemoryFile } from './entities';
import { YamlSourceMapAdapter } from './source-maps';
import SourceMap from 'js-yaml-source-map';
import * as yaml from 'js-yaml';

describe('Source map tests', () => {
  it('Can generate the correct yaml endPointers', () => {
    const contents = `
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
      contents,
    }

    const sourceMap = new SourceMap()
    yaml.load(file.contents, { listener: sourceMap.listen() });


    const adapter = new YamlSourceMapAdapter(sourceMap, file)

    console.log(adapter.lookup('.'))

  })
})
