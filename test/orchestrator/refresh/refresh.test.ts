import path from 'path';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { MockReporter } from '../mocks/reporter.js';
import { ImportOrchestrator } from '../../../src/orchestrators/import.js';
import { MockResource, MockResourceConfig } from '../mocks/resource.js';
import { ResourceSettings } from '@codifycli/plugin-core';
import { ResourceConfig } from '../../../src/entities/resource-config.js';
import { FileModificationResult } from '../../../src/utils/file-modification-calculator.js';
import { fs, vol } from 'memfs';
import { RefreshOrchestrator } from '../../../src/orchestrators/refresh';

vi.mock('../mocks/get-mock-resources.js', async () => {
  return {
    getMockResources: () => ([
      new class extends MockResource {
        getSettings(): ResourceSettings<MockResourceConfig> {
          const orgSettings = super.getSettings();
          return {
            ...orgSettings,
            importAndDestroy: {
              requiredParameters: ['propA', 'propB'],
              refreshKeys: ['propA', 'propB', 'directory'],
            }
          }
        }

        async refresh(parameters: Partial<MockResourceConfig>): Promise<Array<Partial<MockResourceConfig>> | Partial<MockResourceConfig> | null> {
          expect(parameters).toMatchObject({
            propA: expect.any(String),
            propB: expect.any(String),
            directory: null
          })

          return super.refresh(parameters);
        }
      },
      new class extends MockResource {
        getSettings(): ResourceSettings<MockResourceConfig> {
          return {
            id: 'jenv',
            schema: {
              '$schema': 'http://json-schema.org/draft-07/schema',
              '$id': 'https://www.codifycli.com/jenv.json',
              'type': 'object',
              'properties': {
                'add': {
                  'type': 'array'
                },
                'global': {
                  'type': 'string'
                },
                'requiredProp': {
                  'type': 'string'
                }
              },
              'required': ['requiredProp']
            },
            parameterSettings: {
              add: { type: 'array' },
            },
            importAndDestroy: {
              requiredParameters: ['requiredProp'],
              refreshKeys: ['add', 'global', 'requiredProp'],
            }
          }
        }
      },
      new class extends MockResource {
        getSettings(): ResourceSettings<MockResourceConfig> {
          return {
            id: 'alias',
            schema: {
              '$schema': 'http://json-schema.org/draft-07/schema',
              '$id': 'https://www.codifycli.com/alias.json',
              'type': 'object',
              'properties': {
                'alias': {
                  'type': 'string'
                },
                'value': {
                  'type': 'string'
                },
              },
              'required': ['alias']
            },
            parameterSettings: {
              add: { type: 'array' },
            },
            importAndDestroy: {
              requiredParameters: ['alias'],
              refreshKeys: ['alias', 'value'],
            },
            allowMultiple: true,
          }
        }
      },
      new class extends MockResource {
        getSettings(): ResourceSettings<MockResourceConfig> {
          return {
            id: 'mock2',
            parameterSettings: {
              propB: { type: 'number' },
              directory: { type: 'directory' },
              array: { type: 'array', canModify: true }
            }
          }
        }
      }
    ])
  }
})

vi.mock('../../../src/plugins/plugin.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { Plugin: MockPlugin };
})

vi.mock('../../../src/api/backend/index.js', async () => {
  const { fs } = await import('memfs');
  const path = await import('node:path');
  return {
    ApiClient: {
      searchPlugins: vi.fn(async () => ({
        default: { name: 'default', version: '1.0.0', downloadLink: 'https://fake/plugin.js' }
      })),
      downloadPlugin: vi.fn(async (filePath: string) => {
        const dir = path.default.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, 'export default {}');
      }),
    }
  }
})

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs
})

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
})

describe('Refresh orchestrator tests', () => {
  it('Can import and update an existing project (without prompting the user)(this is the no args version)',  async () => {
    const processSpy = vi.spyOn(process, 'cwd');
    processSpy.mockReturnValue('/');

    fs.writeFileSync('/codify.json',
      `[
  {
    "type": "jenv",
    "add": [
      "system",
      "11",
      "11.0"
    ],
    "global": "17",
    "requiredProp": "this-jenv"
  }
]`,
      { encoding: 'utf-8' });

    const reporter = new MockReporter({
      displayImportResult: (importResult) => {
        console.log(JSON.stringify(importResult, null, 2));
        expect(importResult.errors.length).to.eq(0);
        expect(importResult.result.length).to.eq(1);
        expect(importResult.result[0].type).to.eq('jenv');
        expect(importResult.result[0].parameters).toMatchObject({ // Make sure the system values are returned here
          'add': [
            'system',
            '11',
            '11.0',
            '11.0.24',
            '17',
            '17.0.12',
            'openjdk64-11.0.24',
            'openjdk64-17.0.12'
          ],
          'global': '17',
          'requiredProp': 'this-jenv'
        })
      },
      // Option 0 is write to a new file (no current project exists)
      promptOptions: (message, options) => {
        expect(options[0]).toContain('Update existing');
        return 0;
      },
      displayFileModifications: (diff: Array<{ file: string, modification: FileModificationResult }>) => {
        expect(diff[0].file).to.eq('/codify.json')
        console.log(diff[0].file);
      },
    });

    const askRequiredParametersSpy = vi.spyOn(reporter, 'promptUserForValues');
    const displayImportResultSpy = vi.spyOn(reporter, 'displayImportResult');
    const displayFileModifications = vi.spyOn(reporter, 'displayFileModifications');
    const promptConfirmationSpy = vi.spyOn(reporter, 'promptConfirmation');

    MockOs.create('jenv', {
      'add': [
        'system',
        '11',
        '11.0',
        '11.0.24',
        '17',
        '17.0.12',
        'openjdk64-11.0.24',
        'openjdk64-17.0.12'
      ],
      'global': '17',
      'requiredProp': 'this-jenv'
    })

    await RefreshOrchestrator.run(
      {
        path: '/'
      },
      reporter,
    );

    expect(askRequiredParametersSpy).toHaveBeenCalledTimes(0);
    expect(displayImportResultSpy).toHaveBeenCalledOnce();
    expect(displayFileModifications).toHaveBeenCalledOnce();
    expect(promptConfirmationSpy).toHaveBeenCalledOnce();

    const fileWritten = fs.readFileSync('/codify.json', 'utf8') as string;
    console.log(fileWritten);

    expect(JSON.parse(fileWritten)).toMatchObject([
      {
        'type': 'jenv',
        'add': [
          'system',
          '11',
          '11.0',
          '11.0.24',
          '17',
          '17.0.12',
          'openjdk64-11.0.24',
          'openjdk64-17.0.12'
        ],
        'global': '17',
        'requiredProp': 'this-jenv'
      }
    ])
  });


  afterEach(() => {
    vi.resetAllMocks();
    vol.reset();
    MockOs.reset();
  })

})
