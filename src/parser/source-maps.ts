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

  lookup(filePath: string, jsonKey: string): SourceMapPointer | null {
    return this.sourceMaps.get(filePath)?.sourceMap?.lookup(jsonKey) ?? null;
  }

  getCodeSnippet(
    filePath: string,
    jsonKey: string,
    addAdditionalContextLines = true,
    addLineNumbers = true,
  ): string | null {
    const inContextSourceMap = this.get(filePath);
    if (!inContextSourceMap) {
      return null;
    }

    const { file, sourceMap } = inContextSourceMap;
    const pointer = sourceMap.lookup(jsonKey);
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
  private sourceMapTree: YamlBTreeNode[];

  private original: string;
  private originalLines: string[];

  constructor(yamlSourceMap: YamlSourceMap, file: InMemoryFile) {
    this.yamlSourceMap = yamlSourceMap;
    this.original = file.contents;
    this.originalLines = file.contents.split(/\n/gm);

    this.sourceMapTree = this.constructSourceMapBTree(yamlSourceMap);

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
        line: pointer.line,
        column: pointer.column,
        position: pointer.position,
      },
      valueEnd: {
        line: endPointer.line,
        column: endPointer.column,
        position: endPointer.position,
      }
    }
  }

  private constructSourceMapBTree(sourceMap: YamlSourceMap): YamlBTreeNode[] {
    const sortedKeys = [...Object.entries(sourceMap.map)]
      .sort(([k1, v1], [k2, v2]) =>
        v1.line !== v2.line
          ? v1.line - v2.line
          : k1.localeCompare(k2)
      ).map(([k]) => k)

    const result: YamlBTreeNode[] = [];
    for (const key of sortedKeys) {
      const parts = key.split('.').filter(Boolean)

      // Root node
      if (parts.length === 0) {
        result.push({
          key,
          value: sourceMap.lookup(key)!,
          children: [],
        })
        continue;
      }

      this.recursiveBTreeInsert(result[0], parts, sourceMap.lookup(key)!, 0)
    }

    result.push({
      key: 'end',
      value: {
        line: this.originalLines.length,
        column: 0,
        position: this.original.length,
      },
      children: []
    })

    return result;
  }

  private recursiveBTreeInsert(node: YamlBTreeNode, keyParts: string[], value: YamlSourceLocation, idx: number): void {
    if (idx === keyParts.length - 1) {
      node.children.push({
        key: keyParts.join('.'),
        value,
        children: []
      });
      return;
    }

    const keyPart = keyParts[idx];
    const childNode = node.children.find((c) => c.key = keyPart)
    if (!childNode) {
      throw new InternalError('Unable to insert into btree when constructing yaml source map');
    }

    return this.recursiveBTreeInsert(childNode, keyParts, value, idx + 1);
  }

  private recursiveLookUpNextElement(key: string): YamlBTreeNode {
    const keyParts = key.split('.');
    if (keyParts.length === 0) {
      return this.sourceMapTree[1];
    }

    const nextElement = findNextElement(this.sourceMapTree[0], keyParts)
    if (!nextElement) {
      return this.sourceMapTree[1];
    }

    return nextElement;

    function findNextElement(node: YamlBTreeNode, keyParts: string[], idx = 0): YamlBTreeNode | null {
      if (idx === keyParts.length - 1) {
        const part = keyParts[idx];
        const currentNodeIdx = node.children.findIndex((c) => c.key === part);
        return node.children[currentNodeIdx + 1] ?? null;
      }

      const result = findNextElement(node, keyParts, idx + 1)
      if (!result) {
        const part = keyParts[idx];
        const currentNodeIdx = node.children.findIndex((c) => c.key === part);
        return node.children[currentNodeIdx + 1] ?? null;
      }

      return result;
    }

  }

  private convertJsonKeyToYaml(key: string): string {
    return key.replace(/^\//, '').replace(/\//g, '.');
  }

  private calculateEndPointer(key: string): YamlSourceLocation {
    const nextElement = this.recursiveLookUpNextElement(key);
    return nextElement.value;
  }
}
