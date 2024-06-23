import { JsonSourceMap } from 'json-source-map';
import { default as YamlSourceMap, SourceLocation as YamlSourceLocation } from 'js-yaml-source-map';
import { FileType, InMemoryFile } from './entities.js';
import { InternalError } from '../common/errors.js';

type FilePath = string;

interface InContextSourceMap {
  file: InMemoryFile;
  sourceMap: SourceMap;
}

export class SourceMapCache {
  sourceMaps: Map<FilePath, InContextSourceMap> = new Map();

  addSourceMap(file: InMemoryFile, sourceMap: JsonSourceMap | YamlSourceMap) {
    const isJson = file.fileType === FileType.JSON;
    if (isJson) {
      this.sourceMaps.set(file.filePath, {
        file,
        sourceMap: new JsonSourceMapAdapter(sourceMap as JsonSourceMap),
      })
    } else {
      this.sourceMaps.set(file.filePath, {
        file,
        sourceMap: new YamlSourceMapAdapter(sourceMap as YamlSourceMap, file),
      })
    }
  }

  get(filePath: string): InContextSourceMap | null {
    return this.sourceMaps.get(filePath) ?? null;
  }

  has(filePath: string): boolean {
    return this.sourceMaps.has(filePath)
  }

  lookup(filePath: string, jsonKey: string): SourceMapPointer | null {
    return this.sourceMaps.get(filePath)?.sourceMap?.lookup(jsonKey) ?? null;
  }

  getCodeSnippet(
    filePath: string,
    jsonKey: string,
    fragmentParentKey?: string,
    addAdditionalContextLines = true,
    addLineNumbers = true,
  ): string | null {
    const inContextSourceMap = this.get(filePath);
    if (!inContextSourceMap) {
      return null;
    }

    const { file, sourceMap } = inContextSourceMap;

    const fullKey = fragmentParentKey
      ? `${fragmentParentKey}${jsonKey}`
      : jsonKey

    const pointer = sourceMap.lookup(fullKey);
    if (!pointer) {
      return null;
    }

    const lines = file.contents.split(/\n/g);
    const startLine = addAdditionalContextLines
      ? Math.max(pointer.value.line - 3, 0)
      : pointer.value.line

    const endLine = addAdditionalContextLines
      ? Math.min(pointer.valueEnd.line + 4, lines.length)
      : pointer.valueEnd.line + 1

    return lines.slice(startLine, endLine)
      .map((l, idx) => addLineNumbers ? `  ${idx + startLine}| ${l}` : l)
      .join('\n')
  }
}

//****************************************************************************************
// Source map wrappers. These adapt different source map implementations to a single interface
//*********************************************************************************

export interface SourceMapPointer {
  value: SourceLocation;
  valueEnd: SourceLocation;
}

export interface SourceLocation {
  line: number;
  column: number;
  position: number;
}

export interface SourceMap {
  lookup(jsonKey: string): SourceMapPointer | null;
}

export class JsonSourceMapAdapter implements SourceMap {

  /**
   * {
   *   "data": [
   *     {
   *       "type": "type1"
   *     },
   *     {
   *       "type": "type2",
   *       "propA": "a",
   *       "propB": "b"
   *     }
   *   ],
   *   "pointers": {
   *     "": {
   *       "value": { "line": 1, "column": 0, "pos": 1 },
   *       "valueEnd": { "line": 10, "column": 1, "pos": 97 }
   *     },
   *     "/0": {
   *       "value": { "line": 2, "column": 2, "pos": 5 },
   *       "valueEnd": { "line": 4, "column": 3, "pos": 30 }
   *     },
   *     "/0/type": {
   *       "key": { "line": 3, "column": 4, "pos": 11 },
   *       "keyEnd": { "line": 3, "column": 10, "pos": 17 },
   *       "value": { "line": 3, "column": 12, "pos": 19 },
   *       "valueEnd": { "line": 3, "column": 19, "pos": 26 }
   *     },
   *     "/1": {
   *       "value": { "line": 5, "column": 2, "pos": 34 },
   *       "valueEnd": { "line": 9, "column": 3, "pos": 95 }
   *     },
   *     "/1/type": {
   *       "key": { "line": 6, "column": 4, "pos": 40 },
   *       "keyEnd": { "line": 6, "column": 10, "pos": 46 },
   *       "value": { "line": 6, "column": 12, "pos": 48 },
   *       "valueEnd": { "line": 6, "column": 19, "pos": 55 }
   *     },
   *     "/1/propA": {
   *       "key": { "line": 7, "column": 4, "pos": 61 },
   *       "keyEnd": { "line": 7, "column": 11, "pos": 68 },
   *       "value": { "line": 7, "column": 13, "pos": 70 },
   *       "valueEnd": { "line": 7, "column": 16, "pos": 73 }
   *     },
   *     "/1/propB": {
   *       "key": { "line": 8, "column": 4, "pos": 79 },
   *       "keyEnd": { "line": 8, "column": 11, "pos": 86 },
   *       "value": { "line": 8, "column": 13, "pos": 88 },
   *       "valueEnd": { "line": 8, "column": 16, "pos": 91 }
   *     }
   *   }
   * }
   */
  private jsonSourceMap: JsonSourceMap;

  constructor(jsonSourceMap: JsonSourceMap) {
    this.jsonSourceMap = jsonSourceMap;
  }

  lookup(jsonKey: string): SourceMapPointer | null {
    const pointer = this.jsonSourceMap.pointers[jsonKey];
    if (!pointer) {
      return null;
    }

    return {
      value: {
        line: pointer.value.line,
        column: pointer.value.column,
        position: pointer.value.pos,
      },
      valueEnd: {
        line: pointer.valueEnd.line,
        column: pointer.valueEnd.column,
        position: pointer.valueEnd.pos,
      }
    }
  }
}

interface YamlBTreeNode {
  key: string;
  value: YamlSourceLocation;
  children: YamlBTreeNode[];
}

export class YamlSourceMapAdapter implements SourceMap {

  /**
   * (empty line)
   * - type: project
   *   plugins:
   *     default: "../homebrew-plugin/src/index.ts"
   * - type: nvm
   *   global: '18.20'
   *   nodeVersions:
   *   - '18.20'
   * - type: homebrew
   *   formulae:
   *   - cirruslabs/cli/cirrus
   *   - cirruslabs/cli/tart
   * - type: vscode
   *
   * SourceMap {
   *   _map: {
   *     '.3.type': { line: 12, position: 218, lineStart: 212 },
   *     '.3': { line: 12, position: 218, lineStart: 212 },
   *     '.2.formulae.1': { line: 11, position: 211, lineStart: 188 },
   *     '.2.formulae.0': { line: 10, position: 187, lineStart: 162 },
   *     '.2.formulae': { line: 10, position: 187, lineStart: 162 },
   *     '.2.type': { line: 8, position: 139, lineStart: 133 },
   *     '.2': { line: 8, position: 139, lineStart: 133 },
   *     '.1.nodeVersions.0': { line: 7, position: 132, lineStart: 121 },
   *     '.1.nodeVersions': { line: 7, position: 132, lineStart: 121 },
   *     '.1.global': { line: 5, position: 95, lineStart: 87 },
   *     '.1.type': { line: 4, position: 81, lineStart: 75 },
   *     '.1': { line: 4, position: 81, lineStart: 75 },
   *     '.plugins.default': { line: 3, position: 39, lineStart: 28 },
   *     '.plugins': { line: 3, position: 39, lineStart: 28 },
   *     '.type': { line: 1, position: 7, lineStart: 1 }
   *     '.': { line: 1, position: 1, lineStart: 1 },
   *   },
   *   _path: [],
   *   _lastScalar: 'vscode',
   *   _fragments: [],
   *   _count: 29
   * }
   */
  private yamlSourceMap: YamlSourceMap;
  private sourceMapTree: YamlSourceMapBTree;

  constructor(yamlSourceMap: YamlSourceMap, file: InMemoryFile) {
    this.yamlSourceMap = yamlSourceMap;

    const original = file.contents;
    const originalLines = file.contents.split(/\n/gm);

    this.sourceMapTree = new YamlSourceMapBTree(
      yamlSourceMap,
      { line: originalLines.length - 1, position: original.length - 1 }
    )

    console.log(JSON.stringify(this.sourceMapTree, null, 2))
  }

  lookup(jsonKey: string): SourceMapPointer | null {
    const yamlKey = this.convertJsonKeyToYaml(jsonKey)
    const pointer = this.yamlSourceMap.lookup(yamlKey)
    if (!pointer) {
      return null;
    }

    const endPointer = this.calculateEndPointer(yamlKey);

    return {
      value: {
        line: pointer.line - 1,
        column: pointer.column - 1,
        position: pointer.position,
      },
      valueEnd: {
        line: endPointer.line - 1,
        column: endPointer.column -1,
        position: endPointer.position,
      }
    }
  }

  private convertJsonKeyToYaml(key: string): string {
    return key.replace(/^\/0/, '').replace(/^\//, '').replace(/\//g, '.');
  }

  private calculateEndPointer(key: string): YamlSourceLocation {
    const nextElement = this.sourceMapTree.findNextElement(key);
    return nextElement.value;
  }
}

export class YamlSourceMapBTree {
  sourceMapTree: YamlBTreeNode[];

  private endLine: number;
  private endPosition: number;
  private integerRegex = /^[0-9]+$/g

  constructor(sourceMap: YamlSourceMap, end: { line: number; position: number }) {
    this.endLine = end.line;
    this.endPosition = end.position;

    this.sourceMapTree = this.constructSourceMapBTree(sourceMap);
  }

  private constructSourceMapBTree(sourceMap: YamlSourceMap): YamlBTreeNode[] {

    const sortedKeys = [...Object.entries(sourceMap.map)]
      // Hack: There is a bug in js-yaml-source-maps where the first element of a top level array is not treated as an array
      .map(([k, v]) => [this.mapToFixedKey(k), v] as const)
      // Sort the entries to make easier to construct the B-tree. Use the position to sort.
      .sort(([k1, v1], [k2, v2]) => v1.position - v2.position)
      .map(([k]) => k)

    // Hack: add this to match the json source map version. There is a default empty key.
    sortedKeys.unshift('.');

    const tree: YamlBTreeNode[] = [];
    for (const key of sortedKeys) {
      const parts = key.split('.').filter(Boolean)
      const originalKey = this.mapToOriginalKey(key);

      // Root node
      if (parts.length === 0) {
        tree.push({
          key,
          value: sourceMap.lookup(originalKey)!,
          children: [],
        })
        continue;
      }

      recursiveBTreeInsert(tree[0], parts, sourceMap.lookup(originalKey)!, 0)
    }

    // For some reason, the js-yaml-source-map likes like to 1 index numbers. We have to account for that with our custom end node
    tree.push({
      key: 'end',
      value: {
        line: this.endLine + 1,
        column: 1,
        position: this.endPosition,
      },
      children: []
    })

    return tree;

    function recursiveBTreeInsert(node: YamlBTreeNode, keyParts: string[], value: YamlSourceLocation, idx: number): void {
      if (idx === keyParts.length - 1) {
        node.children.push({
          key: keyParts[idx],
          value,
          children: []
        });
        return;
      }

      const keyPart = keyParts[idx];
      const childNode = node.children.find((c) => c.key === keyPart)
      if (!childNode) {
        throw new InternalError(`Unable to insert into btree when constructing yaml source map. \n\n${JSON.stringify(node, null, 2)} \n\n${keyParts} \n\n${idx}`);
      }

      return recursiveBTreeInsert(childNode, keyParts, value, idx + 1);
    }
  }

  findNextElement(key: string): YamlBTreeNode {
    const fixedKey = this.mapToFixedKey(key);
    const keyParts = fixedKey.split('.').filter(Boolean);
    if (keyParts.length === 0) {
      return this.sourceMapTree[1];
    }

    const nextElement = recursiveFindNextElement(this.sourceMapTree[0], keyParts)
    if (!nextElement) {
      return this.sourceMapTree[1];
    }

    return nextElement;

    function recursiveFindNextElement(node: YamlBTreeNode, keyParts: string[], idx = 0): YamlBTreeNode | null {
      if (idx === keyParts.length - 1) {
        const part = keyParts[idx];
        const currentNodeIdx = node.children.findIndex((c) => c.key === part);
        return node.children[currentNodeIdx + 1] ?? null;
      }

      const nextPart = keyParts[idx];
      const nextNode = node.children.find((c) => c.key === nextPart)!

      const result = recursiveFindNextElement(nextNode, keyParts, idx + 1)
      if (!result) {
        const part = keyParts[idx];
        const currentNodeIdx = node.children.findIndex((c) => c.key === part);
        return node.children[currentNodeIdx + 1] ?? null;
      }

      return result;
    }
  }

  // This is a fix to account for the fact that js-yaml-source-maps can't handle
  // top level arrays. We have to manually add the .0 key for the tree doesn't think that
  // the first element of a top level array is actually part of the root object
  private mapToFixedKey(key: string): string {
    if (key === '') {
      return '.'
    }

    if (!key.startsWith('.')) {
      key = `.${key}`
    }

    const firstKey = key.split('.').filter(Boolean)[0]

    if (!firstKey) {
      return '.0';
    }

    return !/^[0-9]+$/.test(firstKey)
      ? `.0${key}`
      : key;
  }

  private mapToOriginalKey(fixedKey: string): string {
     return fixedKey === '.0'
      ? '.'
      : fixedKey.includes('.0')
        ? fixedKey.slice(2)
        : fixedKey
  }
}
