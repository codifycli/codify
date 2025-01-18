export interface PluginSearchQuery {
  name: string;
  version?: string;
}

export interface PluginSearchResult {
  [x: string]: PluginInfo;
}

export interface PluginInfo {
  version: string;
  isLatest: boolean;
  isBeta: boolean;
  downloadLink: string;
}
