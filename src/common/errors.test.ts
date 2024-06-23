import { describe, expect, it } from 'vitest';
import { ajv } from '../utils/ajv';
import { AjvValidationError } from './errors';
import { ResourceSchema } from 'codify-schemas';
import * as jsonSourceMap from 'json-source-map';
import { SourceMapCache } from '../parser/source-maps';
import { JsonParser } from '../parser/json/json-parser';
import { FileType } from '../parser/entities';

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

    console.log(validator.errors)

    const error = new AjvValidationError(
      'resource is not valid',
      validator.errors,
      '/test/path/to/test.json',
      sourceMaps
    );

    console.log(error.formattedMessage())
  })
})
