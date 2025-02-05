import chalk from 'chalk';
import { ResourceConfig } from '../entities/resource-config.js';
import * as Diff from 'diff'
import * as jsonSourceMap from 'json-source-map';

import { FileType, InMemoryFile } from '../parser/entities.js';
import { SourceMap, SourceMapCache } from '../parser/source-maps.js';
import detectIndent from 'detect-indent';
import { Project } from '../entities/project.js';
import { ProjectConfig } from '../entities/project-config.js';

export enum ModificationType {
  INSERT_OR_UPDATE,
  DELETE
}

export interface ModifiedResource {
  resource: ResourceConfig;
  modification: ModificationType
}

export interface FileModificationResult {
  newFile: string;
  diff: string;
}

export class FileModificationCalculator {
  private existingFile: InMemoryFile;
  private existingConfigs: ResourceConfig[];
  private sourceMap: SourceMap;
  private totalConfigLength: number;
  private indentString: string;

  constructor(existing: Project) {
    const { file, sourceMap } = existing.sourceMaps?.getSourceMap(existing.codifyFiles[0])!;
    this.existingFile = file;
    this.sourceMap = sourceMap;
    this.existingConfigs = [...existing.resourceConfigs];
    this.totalConfigLength = existing.resourceConfigs.length + (existing.projectConfig ? 1 : 0);

    const fileIndents = detectIndent(this.existingFile.contents);
    this.indentString = fileIndents.indent;
  }

  async calculate(modifications: ModifiedResource[]): Promise<FileModificationResult> {
    this.validate(modifications);

    let newFile = this.existingFile!.contents.trimEnd();
    const updateCache = [...modifications];

    // Reverse the traversal order so we edit from the back. This way the line numbers won't be messed up with new edits.
    for (const existing of this.existingConfigs.reverse()) {
      const duplicateIndex = modifications.findIndex((modified) => existing.isSameOnSystem(modified.resource))

      // The resource was not modified in any way. Skip.
      if (duplicateIndex === -1) {
        continue;
      }
      updateCache.splice(duplicateIndex, 1)

      const modified = modifications[duplicateIndex];
      const duplicateSourceKey = existing.sourceMapKey?.split('#').at(1)!;
      const sourceIndex = Number.parseInt(duplicateSourceKey.split('/').at(1)!)

      if (modified.modification === ModificationType.DELETE) {
        newFile = this.remove(newFile, this.sourceMap, sourceIndex);
        this.totalConfigLength -= 1;

        continue;
      }

      // Update an existing resource
      newFile = this.remove(newFile, this.sourceMap, sourceIndex);
      newFile = this.update(newFile, modified.resource, this.sourceMap, sourceIndex);
    }

    // Insert new resources
    const newResourcesToInsert = updateCache
      .filter((r) => r.modification === ModificationType.INSERT_OR_UPDATE)
      .map((r) => r.resource)
    const insertionIndex = newFile.length - 2; // Last element is guarenteed to be the closing bracket. We insert 1 before that

    newFile = this.insert(newFile, newResourcesToInsert, insertionIndex);

    return {
      newFile: newFile,
      diff: this.diff(this.existingFile.contents, newFile),
    }
  }

  validate(modifiedResources: ModifiedResource[]): void {
    // The result of the validation rules only apply if we want to insert into a file. If it's a new file nothing is really needed
    if (!this.existingFile) {
      return;
    }

    if (this.existingFile?.fileType !== FileType.JSON) {
      throw new Error(`Only updating .json files are currently supported. Found ${this.existingFile?.filePath}`);
    }

    if (this.existingConfigs.some((r) => !r.resourceInfo)) {
      const badResources = this.existingConfigs
        .filter((r) => this.isResourceConfig(r))
        .map((r) => r.id)

      throw new Error(`All resources must have resource info attached to generate diff. Found bad resources: ${badResources}`);
    }

    if (modifiedResources.some((r) => !r.resource.resourceInfo)) {
      const badResources = modifiedResources
        .filter((r) => !r.resource.resourceInfo)
        .map((r) => r.resource.id);

      throw new Error(`All resources must have resource info attached to generate diff. Found bad resources: ${badResources}`);
    }

    if (!this.sourceMap) {
      throw new Error('Source maps must be provided to generate new code');
    }
  }

  diff(a: string, b: string): string {
    const diff = Diff.diffLines(a, b);

    let result = '';
    diff.forEach((part) => {
      result += part.added ? chalk.green(part.value) :
        part.removed ? chalk.red(part.value) :
          part.value;
    });

    return result;
  }

  // Insert always works at the end
  private insert(
    file: string,
    resources: ResourceConfig[],
    position: number,
  ): string {
    let result = file;

    for (const newResource of resources.reverse()) {
      let content = JSON.stringify(newResource.raw, null, 2);
      content = content.split(/\n/).map((l) => `${this.indentString}${l}`).join('\n')
      content = `,\n${content}`;

      result = this.splice(result, position, 0, content)
    }

    return result;
  }

  private remove(
    file: string,
    sourceMap: SourceMap,
    sourceIndex: number,
  ): string {
    const isLast = sourceIndex === this.totalConfigLength - 1;
    const isFirst = sourceIndex === 0;

    // We try to start deleting from the previous element to the next element if possible. This covers any spaces as well.
    const value = !isFirst ? this.sourceMap.lookup(`/${sourceIndex - 1}`)?.valueEnd : this.sourceMap.lookup(`/${sourceIndex}`)?.value;
    const valueEnd = !isLast ? this.sourceMap.lookup(`/${sourceIndex + 1}`)?.value : this.sourceMap.lookup(`/${sourceIndex}`)?.valueEnd;

    // Start one later so we leave the previous trailing comma alone
    const start = isFirst || isLast ? value!.position : value!.position + 1;

    let result = this.removeSlice(file, start, valueEnd!.position)

    // If there's no gap between the remaining elements, we add a space.
    if (!isFirst && !/\s/.test(result[start])) {
      result = this.splice(result, start, 0, `\n${this.indentString}`);
    }

    return result;
  }

  /** Updates an existing resource config JSON with new values, this method replaces the old object but tries be either 1 line or multi-line like the original */
  private update(
    file: string,
    resource: ResourceConfig,
    sourceMap: SourceMap,
    sourceIndex: number,
  ): string {
    // Updates: for now let's remove and re-add the entire object. Only two formatting availalbe either same line or multi-line
    const { value, valueEnd } = this.sourceMap.lookup(`/${sourceIndex}`)!;
    const isSameLine = value.line === valueEnd.line;

    const isLast = sourceIndex === this.totalConfigLength - 1;
    const isFirst = sourceIndex === 0;

    // We try to start deleting from the previous element to the next element if possible. This covers any spaces as well.
    const start = !isFirst ? this.sourceMap.lookup(`/${sourceIndex - 1}`)?.valueEnd : this.sourceMap.lookup(`/${sourceIndex}`)?.value;

    let content = isSameLine ? JSON.stringify(resource.raw) : JSON.stringify(resource.raw, null, this.indentString);
    content = this.updateParamsToOnelineIfNeeded(content, sourceMap, sourceIndex);

    content = content.split(/\n/).map((l) => `${this.indentString}${l}`).join('\n');
    content = isFirst ? `\n${content},` : `,\n${content}`

    return this.splice(file, start?.position!, 0, content);
  }

  /** Attempt to make arrays and objects oneliners if they were before. It does this by creating a new source map */
  private updateParamsToOnelineIfNeeded(content: string, sourceMap: SourceMap, sourceIndex: number): string {
    // Attempt to make arrays and objects oneliners if they were before. It does this by creating a new source map
    const parsedContent = JSON.parse(content);
    const parsedPointers = jsonSourceMap.parse(content);
    const parsedSourceMap = new SourceMapCache()
    parsedSourceMap.addSourceMap({ filePath: '', fileType: FileType.JSON, contents: parsedContent }, parsedPointers);

    for (const [key, value] of Object.entries(parsedContent)) {
      const source = sourceMap.lookup(`/${sourceIndex}/${key}`);
      if ((Array.isArray(value) || typeof value === 'object') && source && source.value.line === source.valueEnd.line) {
        const { value, valueEnd } = parsedSourceMap.lookup(`#/${key}`)!
        content = this.splice(content, value.position, valueEnd.position - value.position, JSON.stringify(parsedContent[key]))
      }
    }

    return content;
  }

  private splice(s: string, start: number, deleteCount = 0, insert = '') {
    return s.substring(0, start) + insert + s.substring(start + deleteCount);
  }

  private removeSlice(s: string, start: number, end: number) {
    return s.substring(0, start) + s.substring(end);
  }

  /** Transforms a source key from global to file specific */
  private transformSourceKey(key: string): string {
    return key.split('#').at(1)!;
  }

  private isResourceConfig(config: ProjectConfig | ResourceConfig): config is ResourceConfig {
    return config instanceof ResourceConfig;
  }
}
