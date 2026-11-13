import { Config } from '@codifycli/schemas';

export interface RemoteDocument {
  id: string;
  contents: Array<Config>
}

export interface RegistryTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  // Raw JSONC contents of the template (as authored in the dashboard editor)
  rawConfigs: string;
}
