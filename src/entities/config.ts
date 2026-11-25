export enum ConfigType {
  PROJECT = 'project',
  RESOURCE = 'resource',
  TEMPLATE = 'template',
  VARIABLE = 'variable',
  NOTICE = 'notice',
}


export interface ConfigBlock {
  configClass: ConfigType;
  type: string;
}
