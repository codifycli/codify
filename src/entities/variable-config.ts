import { type Condition, type VariableConfig as SchemaVariableConfig, type VariableValue, VariableValueType } from '@codifycli/schemas';

import { type ConfigBlock, ConfigType } from './config.js';

/**
 * Variable JSON supported format
 * {
 *   "type": "variable",
 *   "name": "siteType",
 *   "valueType?": "text" | "number" | "boolean" | "enum" | "multiEnum",
 *   "description?": "What kind of site are you building?",
 *   "options?": ["blog", "portfolio"],
 *   "default?": "blog",
 *   "sensitive?": false,
 *   "when?": { "experience": "advanced" }
 * }
 *
 * A variable is a core config block. It is never sent to a plugin. Its value is asked before planning (see
 * VariableResolver) and replaces ${{ name }} in the resources of the same file. Variables of a template are scoped to
 * the template.
 */
export class VariableConfig implements ConfigBlock {
  readonly configClass = ConfigType.VARIABLE;
  readonly type = ConfigType.VARIABLE;

  raw: SchemaVariableConfig;
  name: string;
  valueType: VariableValueType;
  description?: string;
  options?: string[];
  default?: VariableValue;
  sensitive: boolean;
  when?: Condition;
  sourceMapKey?: string;
  // Not declared with a variable block, only referenced with ${{ name }}. Always a text variable without a default.
  implicit = false;

  constructor(config: SchemaVariableConfig, sourceMapKey?: string) {
    this.raw = config;
    this.name = config.name;
    this.valueType = config.valueType ?? VariableValueType.TEXT;
    this.description = config.description;
    this.options = config.options;
    this.default = config.default;
    this.sensitive = config.sensitive ?? false;
    this.when = config.when;
    this.sourceMapKey = sourceMapKey;
  }

  static implicit(name: string): VariableConfig {
    const variable = new VariableConfig({ type: 'variable', name });
    variable.implicit = true;
    return variable;
  }

  get id(): string {
    return `${this.type}.${this.name}`;
  }

  get isMulti(): boolean {
    return this.valueType === VariableValueType.MULTI_ENUM;
  }
}
