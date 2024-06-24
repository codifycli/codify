export enum ConfigType {
  PROJECT = 'project',
  RESOURCE = 'resource',
}


export interface ConfigBlock {
  configClass: ConfigType;
  type: string;
}
