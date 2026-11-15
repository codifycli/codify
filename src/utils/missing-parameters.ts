import {
  MissingParameter,
  MissingParameterChoice,
  MissingParametersResult,
  PLACEHOLDER_VALUE,
  ParameterPath,
} from '../entities/missing-parameter.js';

type Schema = Record<string, any>;

// Keys that live on the resource's core and are never part of the parameters
const CORE_KEYS = new Set(['dependsOn', 'distro', 'name', 'os', 'type']);

/**
 * Finds the values a resource still needs before it can be planned using the resource's JSON schema:
 *  1. Required keys that are absent (at any depth). Required sets inside oneOf / anyOf are evaluated per branch: the
 *     branch needing the fewest new values wins. If multiple branches tie, a {@link MissingParameterChoice} is returned.
 *  2. Values equal to {@link PLACEHOLDER_VALUE} (at any depth).
 *
 * Null values are an explicit declaration of no value and are never reported. $ref is not supported.
 */
export function findMissingParameters(
  schema: Schema | undefined,
  parameters: Record<string, unknown>,
): MissingParametersResult {
  const required = findMissingRequired(schema ?? {}, parameters, [], {});
  required.parameters = required.parameters.filter((p) => !(p.path.length === 1 && CORE_KEYS.has(p.path[0] as string)));

  const placeholders: MissingParameter[] = findPlaceholderPaths(parameters, [])
    .map((path) => ({ path, reason: 'placeholder', ...describePath(schema, path) }));

  return dedupe({ parameters: [...placeholders, ...required.parameters], choices: required.choices });
}

/** Ex: ['hosts', 0, 'HostName'] => hosts[0].HostName */
export function formatParameterPath(path: ParameterPath): string {
  return path.reduce<string>((result, key) => typeof key === 'number'
    ? `${result}[${key}]`
    : (result ? `${result}.${key}` : key), '');
}

/**
 * Converts user input into the type declared by the schema. Values that can't be converted are returned as is so that
 * plugin validation can report them.
 */
export function coerceParameterValue(value: unknown, type?: string, itemsType?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => coerceParameterValue(v, itemsType));
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  switch (type) {
    case 'integer':
    case 'number': {
      return trimmed !== '' && !Number.isNaN(Number(trimmed)) ? Number(trimmed) : value;
    }

    case 'boolean': {
      if (['1', 'true', 'y', 'yes'].includes(trimmed.toLowerCase())) return true;
      if (['0', 'false', 'n', 'no'].includes(trimmed.toLowerCase())) return false;
      return value;
    }

    case 'array': {
      if (trimmed.startsWith('[')) {
        return tryParseJson(trimmed) ?? value;
      }

      return trimmed.split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => coerceParameterValue(v, itemsType));
    }

    case 'object': {
      return tryParseJson(trimmed) ?? value;
    }

    default: {
      return value;
    }
  }
}

/**
 * Returns a copy of `root` with `value` set at `path`. Missing intermediate objects / arrays are created.
 */
export function setValueAtPath(root: unknown, path: ParameterPath, value: unknown): unknown {
  if (path.length === 0) {
    return value;
  }

  const [key, ...rest] = path;
  const container: any = isContainer(root)
    ? structuredClone(root)
    : (typeof key === 'number' ? [] : {});

  container[key] = setValueAtPath(container[key], rest, value);
  return container;
}

function findMissingRequired(
  schema: Schema,
  value: unknown,
  path: ParameterPath,
  inheritedProperties: Record<string, Schema>,
): MissingParametersResult {
  const result = emptyResult();
  if (!isObject(schema)) {
    return result;
  }

  if (isPlainObject(value)) {
    // Branches of a oneOf / anyOf / allOf often only declare `required`. The property definitions come from the parent.
    const properties = { ...inheritedProperties, ...schema.properties };

    for (const key of (schema.required ?? []) as string[]) {
      if (!(key in value)) {
        merge(result, missingKey(properties[key], [...path, key]));
      }
    }

    for (const [key, child] of Object.entries(value)) {
      const childSchema = schema.properties?.[key]
        ?? (isObject(schema.additionalProperties) ? schema.additionalProperties : undefined);

      if (childSchema) {
        merge(result, findMissingRequired(childSchema, child, [...path, key], {}));
      }
    }

    merge(result, findMissingInCompositions(schema, value, path, properties));
    return result;
  }

  if (Array.isArray(value)) {
    for (const [idx, item] of value.entries()) {
      const itemSchema = Array.isArray(schema.items) ? schema.items[idx] : schema.items;
      if (itemSchema) {
        merge(result, findMissingRequired(itemSchema, item, [...path, idx], {}));
      }
    }

    merge(result, findMissingInCompositions(schema, value, path, {}));
    return result;
  }

  // Primitives can't be missing keys
  return result;
}

function findMissingInCompositions(
  schema: Schema,
  value: unknown,
  path: ParameterPath,
  properties: Record<string, Schema>,
): MissingParametersResult {
  const result = emptyResult();

  // allOf: every branch must be satisfied
  for (const branch of (schema.allOf ?? []) as Schema[]) {
    merge(result, findMissingRequired(branch, value, path, properties));
  }

  // oneOf / anyOf: only one branch needs to be satisfied
  for (const branches of [schema.oneOf, schema.anyOf]) {
    if (Array.isArray(branches)) {
      merge(result, findMissingInBranches(branches, value, path, properties));
    }
  }

  return result;
}

function findMissingInBranches(
  branches: Schema[],
  value: unknown,
  path: ParameterPath,
  properties: Record<string, Schema>,
): MissingParametersResult {
  const evaluated = branches
    .filter((branch) => isObject(branch) && isBranchCompatible(branch, value))
    .map((branch) => ({ branch, result: findMissingRequired(branch, value, path, properties) }));

  if (evaluated.length === 0) {
    // No branch matches the value. Let plugin validation report the error.
    return emptyResult();
  }

  // A branch is already satisfied. Nothing is missing.
  const satisfied = evaluated.find((e) => e.result.parameters.length === 0 && e.result.choices.length === 0);
  if (satisfied) {
    return satisfied.result;
  }

  if (evaluated.length === 1) {
    return evaluated[0].result;
  }

  // The user already started filling out one branch (it has the most of its required keys present). Use that one.
  const progress = (branch: Schema) => isPlainObject(value)
    ? ((branch.required ?? []) as string[]).filter((key) => key in value).length
    : 0;
  const maxProgress = Math.max(...evaluated.map((e) => progress(e.branch)));
  const started = evaluated.filter((e) => progress(e.branch) === maxProgress);
  if (maxProgress > 0 && started.length === 1) {
    return started[0].result;
  }

  // Otherwise the user decides. Options needing the fewest values are listed first.
  const cost = (r: MissingParametersResult) => r.parameters.length + r.choices.length;
  const options = (maxProgress > 0 ? started : evaluated)
    .sort((a, b) => cost(a.result) - cost(b.result));

  const choice: MissingParameterChoice = {
    path,
    options: options.map((e, idx) => ({ label: branchLabel(e.branch, e.result, idx), result: e.result })),
  };

  return { parameters: [], choices: [choice] };
}

/**
 * A required key is absent. If the key is an object with required properties of its own, prompt for those instead of
 * asking for the whole object.
 */
function missingKey(schema: Schema | undefined, path: ParameterPath): MissingParametersResult {
  if (isObject(schema) && schema.const !== undefined) {
    return { parameters: [{ path, reason: 'missing', knownValue: schema.const, ...describeSchema(schema) }], choices: [] };
  }

  const isNestedObject = isObject(schema)
    && schema.type === 'object'
    && isObject(schema.properties)
    && (schema.required?.length > 0 || schema.oneOf || schema.anyOf || schema.allOf);

  if (isNestedObject) {
    const nested = findMissingRequired(schema, {}, path, {});
    if (nested.parameters.length > 0 || nested.choices.length > 0) {
      return nested;
    }
  }

  return {
    parameters: [{ path, reason: 'missing', ...describeSchema(schema) }],
    choices: [],
  };
}

/** Rule out branches that can never match the value (wrong type or a different discriminator value) */
function isBranchCompatible(branch: Schema, value: unknown): boolean {
  if (branch.type !== undefined) {
    const types: string[] = Array.isArray(branch.type) ? branch.type : [branch.type];
    if (!types.some((t) => matchesType(t, value))) {
      return false;
    }
  }

  if (isPlainObject(value) && isObject(branch.properties)) {
    for (const [key, propertySchema] of Object.entries(branch.properties as Record<string, Schema>)) {
      const discriminator = propertySchema?.const;
      if (discriminator !== undefined && key in value && value[key] !== PLACEHOLDER_VALUE && value[key] !== discriminator) {
        return false;
      }
    }
  }

  return true;
}

function branchLabel(branch: Schema, result: MissingParametersResult, idx: number): string {
  const discriminators = Object.entries((branch.properties ?? {}) as Record<string, Schema>)
    .filter(([, s]) => s?.const !== undefined)
    .map(([key, s]) => `${key}: ${JSON.stringify(s.const)}`);

  if (discriminators.length > 0) {
    return discriminators.join(', ');
  }

  const keys = result.parameters.map((p) => p.path.at(-1)).filter((k) => k !== undefined);
  return keys.length > 0 ? keys.join(' + ') : `Option ${idx + 1}`;
}

function findPlaceholderPaths(value: unknown, path: ParameterPath): ParameterPath[] {
  if (value === PLACEHOLDER_VALUE) {
    return [path];
  }

  if (Array.isArray(value)) {
    // A list made only of placeholders (ex: ['<Replace me here!>']) is asked for as a whole list, not item by item
    if (value.length > 0 && value.every((item) => item === PLACEHOLDER_VALUE)) {
      return [path];
    }

    return value.flatMap((item, idx) => findPlaceholderPaths(item, [...path, idx]));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([key, child]) => findPlaceholderPaths(child, [...path, key]));
  }

  return [];
}

/** Best effort lookup of the schema at a path. Compositions are searched for the first branch declaring the key. */
function schemaAtPath(schema: Schema | undefined, path: ParameterPath): Schema | undefined {
  let current = schema;
  for (const key of path) {
    if (!current) {
      return undefined;
    }

    current = flattenCompositions(current)
      .map((s) => typeof key === 'number'
        ? (Array.isArray(s.items) ? s.items[key] : s.items)
        : (s.properties?.[key] ?? (isObject(s.additionalProperties) ? s.additionalProperties : undefined)))
      .find(Boolean);
  }

  return current;
}

/**
 * Array items rarely have a description of their own (ex: `repositories: { type: 'array', items: { type: 'string' } }`).
 * Fall back to the description of the array they belong to.
 */
function describePath(schema: Schema | undefined, path: ParameterPath): Pick<MissingParameter, 'description' | 'itemsType' | 'type'> {
  const described = describeSchema(schemaAtPath(schema, path));
  if (described.description === undefined && typeof path.at(-1) === 'number') {
    return { ...described, description: schemaAtPath(schema, path.slice(0, -1))?.description };
  }

  return described;
}

function describeSchema(schema: Schema | undefined): Pick<MissingParameter, 'description' | 'itemsType' | 'type'> {
  if (!schema) {
    return {};
  }

  const type = firstType(schema);
  return {
    type,
    itemsType: type === 'array' && isObject(schema.items) ? firstType(schema.items) : undefined,
    description: schema.description,
  };
}

/** Pick a single type for the prompt. Prefer string if the schema allows it since any value can be typed as a string */
function firstType(schema: Schema): string | undefined {
  const types = flattenCompositions(schema)
    .flatMap((s) => (Array.isArray(s.type) ? s.type : [s.type]))
    .filter((t) => typeof t === 'string' && t !== 'null');

  return types.includes('string') ? 'string' : types[0];
}

function flattenCompositions(schema: Schema): Schema[] {
  return [
    schema,
    ...[...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]
      .filter(isObject)
      .flatMap(flattenCompositions),
  ];
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'array': { return Array.isArray(value); }
    case 'object': { return isPlainObject(value); }
    case 'integer': { return Number.isInteger(value); }
    case 'null': { return value === null; }
    default: { return typeof value === type; }
  }
}

function dedupe(result: MissingParametersResult): MissingParametersResult {
  const seen = new Set<string>();
  const parameters = result.parameters.filter((p) => {
    const key = JSON.stringify(p.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const seenChoices = new Set<string>();
  const choices = result.choices.filter((c) => {
    const key = JSON.stringify(c.path);
    if (seenChoices.has(key)) return false;
    seenChoices.add(key);
    return true;
  });

  return { parameters, choices };
}

function merge(target: MissingParametersResult, source: MissingParametersResult): void {
  target.parameters.push(...source.parameters);
  target.choices.push(...source.choices);
}

function emptyResult(): MissingParametersResult {
  return { parameters: [], choices: [] };
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isObject(value);
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}
