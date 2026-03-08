import { Ajv, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { ResourceSchema } from '@codifycli/schemas';

import { SourceMapCache } from '../parser/source-maps.js';

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  strictRequired: false,
  allowUnionTypes: true
});

ajv.addSchema(ResourceSchema)
addFormats.default(ajv);

export { ajv };

export function formatAjvErrors(
  ajvErrors: ErrorObject[],
  sourceMapKey?: string,
  sourceMaps?: SourceMapCache
): string {
  let errorMessage = '';
  const displayNumberMaxWidth = ajvErrors.length.toString().length;

  for (const [idx, error] of ajvErrors.entries()) {
    const childMessage = formatAjvError(error, sourceMapKey, sourceMaps);
    const displayNumber = idx + 1;

    errorMessage += childMessage.split(/\n/)
      .map((l, idx) => idx === 0
        ? `${displayNumber.toString().padStart(displayNumberMaxWidth)}. ${l}`
        : ' '.repeat(displayNumberMaxWidth) + `  ${l}`
      ).join('\n')
      + '\n'
  }

  return errorMessage;
}

export function formatAjvError(ajvError: ErrorObject, sourceMapKey?: string, sourceMaps?: SourceMapCache): string {
  let { instancePath } = ajvError;
  if (ajvError.keyword === 'additionalProperties') {
    instancePath = ajvError.params.additionalProperty
  }

  const formattedPath = instancePath.startsWith('/')
    ? instancePath.slice(1)
    : instancePath

  let errorMessage = ajvError.keyword === 'additionalProperties'
    ? `Validation error: additional property "${ajvError.params.additionalProperty}" found. Additional properties are not allowed.`
    : `Validation error: "${formattedPath}" ${ajvError.message}`

  errorMessage += '\n'

  if (sourceMapKey && sourceMaps) {
    const codeSnippet = sourceMaps.getCodeSnippet(SourceMapCache.combineKeys(sourceMapKey, instancePath));
    errorMessage += `${codeSnippet}\n`
  }

  return errorMessage;
}
