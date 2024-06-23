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
      filePath: '/path/to/test.json',
      fileType: FileType.JSON,
      contents: json
    }

    const jsonParser = new JsonParser()
    const result = jsonParser.parse(inMemoryFile)
    expect(result.length).to.eq(3);

    expect(result[0]).toMatchObject({
      config: { type: 'resourceA', propA: 'propA' },
      filePath: '/path/to/test.json',
      lineNumberEnd: 1,
      lineNumberStart: 1,
    })

    expect(result[1]).toMatchObject({
      config: { type: 'project', description: 'description' },
      filePath: '/path/to/test.json',
      lineNumberEnd: 2,
      lineNumberStart: 2,
    })

    expect(result[2]).toMatchObject({
      config:   { type: 'resourceB' },
      filePath: '/path/to/test.json',
      lineNumberEnd: 5,
      lineNumberStart: 3,
    })

  })
})
