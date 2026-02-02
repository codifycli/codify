import { ResourceConfig } from '../../entities/resource-config.js';

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
