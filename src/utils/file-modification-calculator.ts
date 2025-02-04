import chalk from 'chalk';
import { ResourceConfig } from '../entities/resource-config.js';
import * as Diff from 'diff'
import { FileType, InMemoryFile } from '../parser/entities.js';

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

  constructor(existingResources: ResourceConfig[], existingFile: InMemoryFile) {
    this.existingFile = existingFile;
    this.existingResources = existingResources;
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

    for (const modified of modifications) {
      const duplicateIndex = this.existingResources.findIndex((existing) => existing.isSameOnSystem(modified.resource))

      if (duplicateIndex === -1) {
        if (modified.modification === ModificationType.INSERT_OR_UPDATE) {
          resultResources.push(modified.resource);
        }

        continue;
      }

      if (modified.modification === ModificationType.DELETE) {
        resultResources.splice(duplicateIndex, 1);
        continue;
      }

      const duplicate = resultResources[duplicateIndex];
      for (const [key, newValue] of Object.entries(modified.resource.parameters)) {
        duplicate.setParameter(key, newValue);
      }
    }

    const newFile = JSON.stringify(
      resultResources.map((r) => r.raw),
      null, 2
    );

    return {
      newFile,
      diff: this.diff(this.existingFile.contents, newFile),
    }
  }

  validate(modifiedResources: ModifiedResource[]): void {
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
}
