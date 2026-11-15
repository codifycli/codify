import { ResourceConfig } from './resource-config.js';

/**
 * The placeholder value the Codify dashboard writes into configs for values the user still needs to fill in.
 */
export const PLACEHOLDER_VALUE = '<Replace me here!>';

/** Location of a value inside a resource's parameters. Strings are object keys, numbers are array indices. */
export type ParameterPath = Array<number | string>;

/**
 * A single value that must be supplied by the user before the resource can be planned.
 */
export interface MissingParameter {
  /** Path from the root of the resource's parameters. Ex: ['hosts', 0, 'HostName'] */
  path: ParameterPath;
  /** 'missing' if the key is absent but required by the schema. 'placeholder' if the value is {@link PLACEHOLDER_VALUE} */
  reason: 'missing' | 'placeholder';
  /** JSON schema type of the value (if known). Used to convert the user's input. */
  type?: string;
  /** JSON schema type of the array items (if type is 'array'). */
  itemsType?: string;
  description?: string;
  /** Set when the value is known without asking the user (a schema const, ex: a discriminator). It is filled automatically. */
  knownValue?: unknown;
}

/**
 * Raised when a schema contains a oneOf / anyOf where multiple branches are equally valid. Ex: git-repository
 * requires either 'directory' or 'parentDirectory'. The user must pick one of the options before values can be prompted.
 */
export interface MissingParameterChoice {
  /** Path to the object the choice applies to */
  path: ParameterPath;
  options: Array<{ label: string; result: MissingParametersResult }>;
}

export interface MissingParametersResult {
  parameters: MissingParameter[];
  choices: MissingParameterChoice[];
}

/**
 * A missing parameter that is ready to be shown to the user.
 */
export interface MissingParameterPrompt extends MissingParameter {
  /** Human readable path. Ex: hosts[0].HostName */
  label: string;
  /** Input should be masked */
  sensitive: boolean;
}

/**
 * All of the values that need to be prompted for a single resource. Passed to {@link Reporter.promptMissingParameters}.
 */
export interface ResourceMissingParameters {
  resource: ResourceConfig;
  parameters: MissingParameterPrompt[];
  /** Sensitive parameters of the resource type. Their existing values are masked when the resource is shown. */
  sensitiveParameters?: string[];
}
