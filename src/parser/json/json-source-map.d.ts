declare module 'src/parser2/json/json-source-map.js' {
  export interface JsonSourceMap {
    pointers: JsonPointerObject;
  }

  export interface JsonSourceMapParse extends JsonSourceMap {
    data: any;
  }

  export interface JsonSourceMapStringify extends JsonSourceMap {
    json: string;
  }

  // the string represents the key of the element. For objects it's the key (ex: /type),
  // for arrays it's the index (ex: /0, /1)
  export type JsonPointerObject = Record<string, {
    // Keys only exist for json objects
    key?: JsonPointerValue;
    keyEnd?: JsonPointerValue;

    value: JsonPointerValue;
    valueEnd: JsonPointerValue;
  }>

  export interface JsonPointerValue {
    line: number;
    column: number;
    pos: number;
  }

  export function parse(json: String, _: any, options: any): JsonSourceMapParse

  export function stringify(data: any, _: any, space: string | number | object): JsonSourceMapStringify
}
