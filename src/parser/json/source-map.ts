import { JsonSourceMap } from 'json-source-map';

import { SourceMap, SourceMapPointer } from '../source-maps.js';

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

