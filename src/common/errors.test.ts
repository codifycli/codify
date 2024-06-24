import { describe, expect, it } from 'vitest';
import { ajv } from '../utils/ajv';
import { AjvValidationError } from './errors';
import { ResourceSchema } from 'codify-schemas';
import { SourceMapCache } from '../parser/source-maps';
import { JsonParser } from '../parser/json/json-parser';
import { FileType } from '../parser/entities';
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
`Validation error: resource is not valid

"/dependsOn"  must be array
      
   7|   {
   8|     "type": "resourceType",
   9|     "name": "something",
> 10|     "dependsOn": "supposed to be an array"
  11|   }
  12| ]`)
  })
})
