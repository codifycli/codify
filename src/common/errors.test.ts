import { describe, expect, it } from 'vitest';
import { ajv } from '../utils/ajv.js';
import { AjvValidationError } from './errors.js';
import { ResourceSchema } from 'codify-schemas';
import { SourceMapCache } from '../parser/source-maps.js';
import { JsonParser } from '../parser/json/json-parser.js';
import { FileType } from '../parser/entities.js';
import stripAnsi from 'strip-ansi';

describe('AjvValidationError tests', () => {
  it('Can properly format a AJV error message without source maps', () => {
    const validator = ajv.compile(ResourceSchema);
    const content = {
      // missing type
      "name": "something",
      "dependsOn": "supposed to be an array"
    };

    const isValid = validator(content)
    expect(isValid).to.be.false;

    const error = new AjvValidationError(
      'resource is not valid',
      validator.errors
    );

    console.log(error.formattedMessage())
  })

  it('Can properly format a AJV error message with source maps', () => {
    const contents = `
[
  {
    "type": "resourceType",
    "name": "something",
    "dependsOn": []
  },
  {
    "type": "resourceType",
    "name": "something",
    "dependsOn": "supposed to be an array"
  }
]`;

    const sourceMaps = new SourceMapCache()
    const result = new JsonParser().parse({
      fileType: FileType.JSON,
      filePath: '/test/path/to/test.json',
      contents
    }, sourceMaps);

    const validator = ajv.compile(ResourceSchema);
    const isValid = validator(result[1].contents)
    expect(isValid).to.be.false;

    const error = new AjvValidationError(
      'resource is not valid',
      validator.errors,
      '/test/path/to/test.json#/1',
      sourceMaps
    );

    console.log(error.formattedMessage())
    expect(stripAnsi(error.formattedMessage())).to.eq(
`Validation error: resource is not valid.

1. Validation error: "dependsOn" must be array
   File: /test/path/to/test.json
      7 |   {
      8 |     "type": "resourceType",
      9 |     "name": "something",
   > 10 |     "dependsOn": "supposed to be an array"
     11 |   }
     12 | ]
   
`)
  })
})
