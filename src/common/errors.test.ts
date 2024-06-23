import { describe, expect, it } from 'vitest';
import { ajv } from '../utils/ajv';
import { AjvValidationError } from './errors';
import { ResourceSchema } from 'codify-schemas';
import * as jsonSourceMap from 'json-source-map';

describe('AjvValidationError tests', () => {
  it('Can properly format a AJV error message without content', () => {
    const validator = ajv.compile(ResourceSchema);
    const content = {
      // missing type
      "name": "something",
      "dependsOn": "supposed to be a array"
    };

    const isValid = validator(content)
    expect(isValid).to.be.false;

    const error = new AjvValidationError(
      'resource is not valid',
      validator.errors,
      {
        fileName: 'any',
        contents: content,
      });

    console.log(error.formattedMessage())
  })

  it('Constructs source maps', () => {
    const result = jsonSourceMap.parse(`
[
  {
    "type": "type1"
  },
  {
    "type": "type2",
    "propA": "a",
    "propB": "b"
  }
]
    `)

    console.log(JSON.stringify(result, null, 2));
  })
})
