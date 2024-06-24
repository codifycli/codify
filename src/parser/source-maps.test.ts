import { describe, it, expect } from 'vitest';
import { FileType, InMemoryFile } from './entities';
import { YamlSourceMapAdapter, YamlSourceMapBTree } from './source-maps';
import SourceMap from 'js-yaml-source-map';
import * as yaml from 'js-yaml';
import { exec } from 'child_process';

describe('Yaml source map tests', () => {
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
    yaml.load(file.contents, { listener: sourceMap.listen() });

    const adapter = new YamlSourceMapAdapter(sourceMap, file)

    expect(adapter.lookup('')).toMatchObject({
      value: { line: 1, column: 0, position: 1 },
      valueEnd: { line: 12, column: 0, position: 226 }
    })

    expect(adapter.lookup('/0/plugins/default')).toMatchObject({
      value: { line: 3, column: 11, position: 40 },
      valueEnd: { line: 4, column: 6, position: 82 }
    })

  })

  it('Can construct a proper yaml source map tree', () => {
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
- type: vscode`

    // Initialize the source map
    const sourceMap = new SourceMap()
    yaml.load(contents, { listener: sourceMap.listen() });

    const sourceMapTree = new YamlSourceMapBTree(sourceMap, { line: contents.split(/\n/).length - 1, position: contents.length -1 })

    // Two root nodes, the actual root and an artificial end node
    expect(sourceMapTree.sourceMapTree.length).to.eq(2);
    expect(sourceMapTree.sourceMapTree[0].key).to.eq('.')

    // 4 children in the top level array
    const topLevelArr = sourceMapTree.sourceMapTree[0].children;
    expect(topLevelArr.length).to.eq(4)

    // Arrays in this format are represented as integer objects
    expect(topLevelArr[0].key).to.eq('0')
    expect(topLevelArr[1].key).to.eq('1')
    expect(topLevelArr[2].key).to.eq('2')
    expect(topLevelArr[3].key).to.eq('3')

    // The first config ("type": "project") has two keys
    expect(topLevelArr[0].children.length).to.eq(2);
    expect(topLevelArr[0].children[0].key).to.eq('type');
    expect(topLevelArr[0].children[1].key).to.eq('plugins');

    // Assume that the rest of the keys look correct as well
  })

  it('Can retrieve the next element from tree', () => {
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
- type: vscode`

    // Initialize the source map
    const sourceMap = new SourceMap()
    yaml.load(contents, { listener: sourceMap.listen() });

    const sourceMapTree = new YamlSourceMapBTree(sourceMap, { line: contents.split(/\n/).length - 1, position: contents.length -1 })

    // The next element from root will return the fake end node
    expect(sourceMapTree.findNextElement('').key).to.eq('end')

    // The next element from homebrew.formulae./cli/tart (.2.formulae.1) will return vscode (.3)
    expect(sourceMapTree.findNextElement('.2.formulae.1').key).to.eq('3')

    // The next element from vscode(.3.type) will return the end
    expect(sourceMapTree.findNextElement('.3.type').key).to.eq('end')

    // Note that there is a slight inconsistency (or bug I guess lol) for the '.' character, please use '' instead of '.'
    // This happens because we have to fake the first element. The library js-yaml-source-map has a bug with top level arrays
    // where it treats the elements as part of the root object (.type instead of .0.type). We manually append .0 to everything
    // at the top level except for the key ''
    expect(sourceMapTree.findNextElement('.').key).to.eq('1')
  })
})
