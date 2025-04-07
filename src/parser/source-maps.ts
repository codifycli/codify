import { JsonSourceMap } from 'json-source-map';
import { default as YamlSourceMap, SourceLocation as YamlSourceLocation } from 'js-yaml-source-map';
import { FileType, InMemoryFile } from './entities.js';
import { InternalError } from '../common/errors.js';
import chalk from 'chalk';
import { JsonSourceMapAdapter } from './json/source-map.js';
import { YamlSourceMapAdapter } from './yaml/source-map.js';

type FilePath = string;

interface InContextSourceMap {
  file: InMemoryFile;
  sourceMap: SourceMap;
}

export class SourceMapCache {
  sourceMaps: Map<FilePath, InContextSourceMap> = new Map();

  // The source map key follows the following conventions: /file/path#/json/path
  // If the key refers to an root object, then /file/path is allowed
  // Arrays are indexed as a integer object /file/path#/0
  static constructKey(filePath: string, fragment?: string) {
    return `${filePath}${ fragment ? `#${fragment}` : ''}`
  }

  static combineKeys(key1: string, key2: string): string {
    if (!key1.includes('#')) {
      return `${key1}#${key2}`
    }

    if (key1.endsWith('/') && key2.startsWith('/')) {
      return `${key1.slice(0, -1)}${key2}`
    }

    if (key1.endsWith('/') || key2.startsWith('/')) {
      return `${key1}${key2}`
    }

    if (key2.endsWith('/')) {
      key2 = key2.slice(0, -1)
    }

    return `${key1}/${key2}`
  }

  addSourceMap(file: InMemoryFile, sourceMap: JsonSourceMap | YamlSourceMap) {
    if (file.fileType === FileType.YAML) {
      this.sourceMaps.set(file.filePath, {
        file,
        sourceMap: new YamlSourceMapAdapter(sourceMap as YamlSourceMap, file),
      })
    } else {
      this.sourceMaps.set(file.filePath, {
        file,
        sourceMap: new JsonSourceMapAdapter(sourceMap as JsonSourceMap),
      })
    }
  }

  getSourceMap(sourceMapKey: string): InContextSourceMap | null {
    const [filePath] = sourceMapKey.split('#');
    return this.sourceMaps.get(filePath) ?? null;
  }

  hasSourceMap(sourceMapKey: string): boolean {
    const [filePath] = sourceMapKey.split('#');
    return this.sourceMaps.has(filePath)
  }

  lookup(sourceMapKey: string): SourceMapPointer | null {
    const sourceMap = this.getSourceMap(sourceMapKey);
    if (!sourceMap) {
      return null;
    }

    const [, jsonKey] = sourceMapKey.split('#');
    return sourceMap.sourceMap.lookup(this.cleanupJsonKey(jsonKey)) ?? null;
  }

  getCodeSnippet(
    sourceMapKey: string,
    addAdditionalContextLines = true,
    addLineNumbers = true,
  ): string | null {
    const inContextSourceMap = this.getSourceMap(sourceMapKey);
    if (!inContextSourceMap) {
      return null;
    }

    const { file, sourceMap } = inContextSourceMap;
    const pointer = this.lookup(sourceMapKey);
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

    const maxLineNumberLength = Math.max(startLine.toString().length, endLine.toString().length);

    // Format the string to look good
    return chalk.black(`File: ${file.filePath}\n`)
      + lines.slice(startLine, endLine)
        .map((l, idx) => {
          // Some cool formatting here. First add a carat at the beginning to indicate the first non-additional line
          const carat = idx + startLine === pointer.value.line ? chalk.yellow('>') : ' ';

          // Add line numbers but pad them so that they are all the same width
          const lineNumber = chalk.black((idx + startLine).toString().padStart(maxLineNumberLength))

          // Highlight the important lines in green
          const line = (idx + startLine >= pointer.value.line && idx + startLine <= pointer.valueEnd.line) ? chalk.green(l) : l

          return addLineNumbers ? `${carat} ${lineNumber} ${chalk.black('|')} ${line}` : line
        })
        .join('\n')
  }

  private cleanupJsonKey(key: string): string {
    if (key.endsWith('/')) {
      key = key.slice(0, -1);
    }

    return key;
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
