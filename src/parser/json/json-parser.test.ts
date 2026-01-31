import { describe, expect, it } from 'vitest';
import { JsonParser } from './json-parser.js';
import { FileType, InMemoryFile } from '../entities.js';

describe('JSONParser tests', () => {
  it('Can parse a codify json file', () => {
    const json = `[
  { "type": "resourceA", "propA": "propA" },
  { "type": "project", "description": "description" },
  {
    "type": "resourceB"
  }
]`

    const inMemoryFile: InMemoryFile = {
      path: '/path/to/test.json',
      fileType: FileType.JSON,
      contents: json
    }

    const jsonParser = new JsonParser()
    const result = jsonParser.parse(inMemoryFile)
    expect(result.length).to.eq(3);

    expect(result[0]).toMatchObject({
      contents: { type: 'resourceA', propA: 'propA' },
      sourceMapKey: "/path/to/test.json#/0"
    })

    expect(result[1]).toMatchObject({
      contents: { type: 'project', description: 'description' },
      sourceMapKey: "/path/to/test.json#/1",
    })

    expect(result[2]).toMatchObject({
      contents:   { type: 'resourceB' },
      sourceMapKey: "/path/to/test.json#/2"
    })
  })
})
