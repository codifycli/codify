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
  // Added with template versions. Older API responses don't have them.
  profileName?: string;
  // `@profile/name`
  fullName?: string;
  // The version returned (the pinned one, or the latest)
  version?: null | string;
  versionId?: null | string;
  latestVersion?: null | string;
}
