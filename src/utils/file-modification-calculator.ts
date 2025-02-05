import chalk from 'chalk';
import { ResourceConfig } from '../entities/resource-config.js';
import * as Diff from 'diff'
import { FileType, InMemoryFile } from '../parser/entities.js';
import { SourceLocation, SourceMapCache } from '../parser/source-maps.js';
import detectIndent from 'detect-indent';

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
  private existingFile?: InMemoryFile;
  private existingResources: ResourceConfig[];
  private sourceMaps: SourceMapCache;

  constructor(existingResources: ResourceConfig[], existingFile: InMemoryFile, sourceMaps: SourceMapCache) {
    this.existingFile = existingFile;
    this.existingResources = existingResources;
    this.sourceMaps = sourceMaps;
  }

  async calculate(modifications: ModifiedResource[]): Promise<FileModificationResult> {
    const resultResources = [...this.existingResources]

    if (this.existingResources.length === 0 || !this.existingFile) {
      const newFile = JSON.stringify(
        modifications
          .filter((r) => r.modification === ModificationType.INSERT_OR_UPDATE)
          .map((r) => r.resource.raw),
        null, 2)

      return {
        newFile,
        diff: this.diff('', newFile),
      }
    }

    this.validate(modifications);
    const { sourceMap, file } = this.sourceMaps.getSourceMap('/codify.json')!;
    const fileIndents = detectIndent(file.contents);
    const indentString = fileIndents.indent;

    let newFile = file.contents.trimEnd();

    console.log(JSON.stringify(sourceMap, null, 2))

    // Reverse the traversal order so we edit from the back. This way the line numbers won't be messed up with new edits.
    for (const modified of modifications.reverse()) {
      const duplicateIndex = this.existingResources.findIndex((existing) => existing.isSameOnSystem(modified.resource))

      if (duplicateIndex === -1) {
        if (modified.modification === ModificationType.INSERT_OR_UPDATE) {
          const config = JSON.stringify(modified.resource.raw, null, indentString)
          newFile = this.insertConfig(newFile, config, indentString);
        }

        continue;
      }

      const duplicate = this.existingResources[duplicateIndex];
      const duplicateSourceKey = duplicate.sourceMapKey?.split('#').at(1)!;

      if (modified.modification === ModificationType.DELETE) {
        const { value, valueEnd } = sourceMap.lookup(duplicateSourceKey)!

        newFile = this.remove(newFile, value, valueEnd);
        continue;

      }

      resultResources.splice(duplicateIndex, 1, modified.resource);
    }

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

    if (this.existingResources.some((r) => !r.resourceInfo)) {
      const badResources = this.existingResources
        .filter((r) => !r.resourceInfo)
        .map((r) => r.id);

      throw new Error(`All resources must have resource info attached to generate diff. Found bad resources: ${badResources}`);
    }

    if (modifiedResources.some((r) => !r.resource.resourceInfo)) {
      const badResources = modifiedResources
        .filter((r) => !r.resource.resourceInfo)
        .map((r) => r.resource.id);

      throw new Error(`All resources must have resource info attached to generate diff. Found bad resources: ${badResources}`);
    }

    if (!this.sourceMaps) {
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
  private insertConfig(
    file: string,
    config: string,
    indentString: string,
  ) {
    const configWithIndents = config.split(/\n/).map((l) => `${indentString}l`).join('\n');
    const result = file.substring(0, configWithIndents.length - 1) + ',' + configWithIndents + file.at(-1);

    // Need to fix the position of the comma

    return result;
  }

  private remove(
    file: string,
    value: SourceLocation,
    valueEnd: SourceLocation,
  ): string {
    let result = file.substring(0, value.position) + file.substring(valueEnd.position)

    let commaIndex = - 1;
    for (let counter = value.position; counter > 0; counter--) {
      if (result[counter] === ',') {
        commaIndex = counter;
        break;
      }
    }

    // Not able to find comma behind (this was the first element). We want to delete the comma behind then.
    if (commaIndex === -1) {
      for (let counter = value.position; counter < file.length - 1; counter++) {
        if (result[counter] === ',') {
          commaIndex = counter;
          break;
        }
      }
    }

    if (commaIndex !== -1) {
      result = this.splice(result, commaIndex, 1)
    }

    return result;
  }

  private splice(s: string, start: number, deleteCount = 0, insert = '') {
    return s.substring(0, start) + insert + s.substring(start + deleteCount);
  }
}
