import { describe, it, expect } from 'vitest';
import { FileType, InMemoryFile } from './entities';
import { YamlSourceMapAdapter } from './source-maps';
import SourceMap from 'js-yaml-source-map';
import * as yaml from 'js-yaml';
import { ConfigFileSchema } from 'codify-schemas';
import { ajv } from '../utils/ajv';
import { valid } from 'semver';

describe('Source map tests', () => {
  it('Can generate the correct yaml endPointers', () => {
    const contents = `
- type1: project
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
- type: vscode`

    const file: InMemoryFile = {
      filePath: '/path/to/test.yaml',
      fileType: FileType.YAML,
      contents,
    }

    const sourceMap = new SourceMap()
    const parsed = yaml.load(file.contents, { listener: sourceMap.listen() });

    // console.log(sourceMap.lookup('.0'))
    //
    // const validator = ajv.compile(ConfigFileSchema);
    // validator(parsed)
    // console.log(JSON.stringify(validator.errors, null, 2))
    // console.log(JSON.stringify(sourceMap.map, null, 2))
    // console.log(sourceMap.lookup('.plugins.default'))
    // console.log(sourceMap.lookup('.plugins.default'))
    // console.log(sourceMap.lookup('.'))


    const adapter = new YamlSourceMapAdapter(sourceMap, file)

    expect(adapter.lookup('')).toMatchObject({
      value: { line: 1, column: 0, position: 1 },
      valueEnd: { line: 12, column: 0, position: 226 }
    })

    console.log(adapter.lookup('/0/plugins/default'))

    // expect().toMatchObject({
    //   value: { line: 2, column: 1, position: 1 },
    //   valueEnd: { line: 13, column: 0, position: 226 }
    // })

  })
})
