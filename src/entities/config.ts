export enum ConfigType {
  PROJECT = 'project',
  RESOURCE = 'resource',
  TEMPLATE = 'template',
}


export interface ConfigBlock {
  configClass: ConfigType;
  type: string;
}
