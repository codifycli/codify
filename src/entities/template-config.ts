import { Condition, LinuxDistro, ResourceOs, TemplateConfig as SchemaTemplateConfig, VariableValue } from '@codifycli/schemas';

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
 *   "when?": { "siteType": "blog" },
 *   "variables?": { "projectName": "${{ projectName }}" },
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
  // Only include the template if the condition matches
  when?: Condition;
  // Values for the variables of the template, as declared (can reference the variables of the including config)
  variables?: Record<string, VariableValue>;
  // `variables` with the references replaced. Set by the VariableResolver before the template is expanded.
  resolvedVariables?: Record<string, unknown>;
  // Names of the resolvedVariables whose value comes from a secret or a sensitive variable
  resolvedSensitiveVariables?: Set<string>;
  sourceMapKey?: string;

  constructor(config: SchemaTemplateConfig, sourceMapKey?: string) {
    this.raw = config;
    this.name = config.name;
    this.source = config.source;
    this.version = config.version;
    this.dependsOn = config.dependsOn ?? [];
    this.os = config.os;
    this.distro = config.distro;
    this.when = config.when;
    this.variables = config.variables;
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
