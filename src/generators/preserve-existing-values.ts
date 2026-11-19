/**
 * Import and refresh write the state of the machine back into the config file. The plugin only knows about the
 * resolved values, so writing its output as is would lose things the user declared on purpose:
 *   - core properties (name, dependsOn, os, distro). Plugins never return these.
 *   - values that contain a variable: `${{ var }}` (codify variables), `${type.name}` (resource references) and
 *     `$ENV_VAR` / `${ENV_VAR}` (environment variables). The plugin returns the resolved value instead.
 *
 * The functions here merge the imported parameters into the existing declaration so these are kept in place.
 */

// Keys of a resource declaration that belong to Codify and not to the plugin. Plugins never return them on import.
export const CORE_PROPERTY_KEYS = ['name', 'dependsOn', 'os', 'distro'] as const;

const VARIABLE_PATTERNS = [
  /\$\{\{\s*[\w\-]+\s*\}\}/u, // ${{ variable }}
  /\$\{[\w.]+\}/u, // ${type.name} resource references and ${ENV_VAR}
  /\$[A-Z_][\dA-Z_]*/u, // $ENV_VAR
];

/** True if the value is a string with a variable, or an array / object that contains one at any depth. */
export function hasVariable(value: unknown): boolean {
  if (typeof value === 'string') {
    return VARIABLE_PATTERNS.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some((v) => hasVariable(v));
  }

  if (isObject(value)) {
    return Object.values(value).some((v) => hasVariable(v));
  }

  return false;
}

/**
 * Merges an imported value into the existing (declared) value. Wherever the existing value contains a variable, the
 * imported value is ignored and the existing value is kept:
 *   - strings with a variable are kept as is
 *   - objects are merged key by key. Keys only in the imported value are added, keys missing from the imported value
 *     are removed unless they contain a variable
 *   - arrays that contain a variable are kept as is. The resolved value of a variable is not known here, so the
 *     imported items can't be matched to the declared items without risking duplicates or dropping the variable.
 *   - everything else takes the imported value
 */
export function preserveVariables(existing: unknown, imported: unknown): unknown {
  if (!hasVariable(existing)) {
    return imported;
  }

  if (isObject(existing) && isObject(imported)) {
    const result: Record<string, unknown> = {};

    for (const [key, importedValue] of Object.entries(imported)) {
      result[key] = Object.hasOwn(existing, key) ? preserveVariables(existing[key], importedValue) : importedValue;
    }

    for (const [key, existingValue] of Object.entries(existing)) {
      if (!Object.hasOwn(imported, key) && hasVariable(existingValue)) {
        result[key] = existingValue;
      }
    }

    return result;
  }

  // Strings and arrays with variables, or a type mismatch (ex: the declared value is a string with a variable and the
  // plugin returned an object). The declared value wins.
  return existing;
}

/**
 * The declaration to write back to the file for an imported resource.
 * @param existing The declaration as it is written in the file (not the in memory config: names can be generated)
 * @param importedParameters The parameters returned by the plugin
 */
export function mergeImportedIntoExisting(
  existing: Record<string, unknown>,
  importedParameters: Record<string, unknown>,
): Record<string, unknown> {
  const coreKeys = new Set<string>(['type', ...CORE_PROPERTY_KEYS]);

  const existingCore = Object.fromEntries(Object.entries(existing).filter(([key]) => coreKeys.has(key)));
  const existingParameters = Object.fromEntries(Object.entries(existing).filter(([key]) => !coreKeys.has(key)));
  // The plugin output is never allowed to change the core properties
  const parameters = Object.fromEntries(Object.entries(importedParameters).filter(([key]) => !coreKeys.has(key)));

  return {
    ...existingCore,
    ...(preserveVariables(existingParameters, parameters) as Record<string, unknown>),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
