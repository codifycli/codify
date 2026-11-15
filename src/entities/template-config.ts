import { LinuxDistro, ResourceOs, TemplateConfig as SchemaTemplateConfig } from '@codifycli/schemas';

import { ConfigBlock, ConfigType } from './config.js';

/** Template JSON supported format
 * {
 *   "type": "template",
 *   "name?": "optional-name",
 *   "source": "nvm" | "@profile/nvm" | "<dashboard document uuid>",
 *   "version?": "1.0.0",
 *   "dependsOn?": [],
 *   "os?": [],
 *   "distro?": [],
 * }
 *
 * A template is a core config block (like the project block). It is never sent to a plugin. Instead it is expanded
 * into the resources of the template (see TemplateExpander) at the position it is declared.
 */
export class TemplateConfig implements ConfigBlock {
  readonly configClass = ConfigType.TEMPLATE;
  readonly type = ConfigType.TEMPLATE;

  raw: SchemaTemplateConfig;
  name?: string;
  source: string;
  version?: string;
  dependsOn: string[];
  os?: ResourceOs[];
  distro?: LinuxDistro[];
  sourceMapKey?: string;

  constructor(config: SchemaTemplateConfig, sourceMapKey?: string) {
    this.raw = config;
    this.name = config.name;
    this.source = config.source;
    this.version = config.version;
    this.dependsOn = config.dependsOn ?? [];
    this.os = config.os;
    this.distro = config.distro;
    this.sourceMapKey = sourceMapKey;
  }

  get id(): string {
    return this.name ? `${this.type}.${this.name}` : this.type;
  }

  /** Identifies the template contents (not the declaration). Used to detect cycles and repeated inclusions. */
  get sourceKey(): string {
    return this.version ? `${this.source}@${this.version}` : this.source;
  }
}
