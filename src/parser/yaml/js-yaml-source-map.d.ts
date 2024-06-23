import { SourceLocation } from 'js-yaml-source-map';

declare module 'js-yaml-source-map' {
  export interface SourceLocation {
    line: number;
    column: number;
    position: number;
  }
}
