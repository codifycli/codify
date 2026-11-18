export enum ConfigType {
  PROJECT = 'project',
  RESOURCE = 'resource',
  TEMPLATE = 'template',
  VARIABLE = 'variable',
}


export interface ConfigBlock {
  configClass: ConfigType;
  type: string;
}
