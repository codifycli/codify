import path from 'path';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { MockReporter } from '../mocks/reporter.js';
import { ImportOrchestrator } from '../../../src/orchestrators/import.js';
import { MockResource, MockResourceConfig } from '../mocks/resource.js';
import { ResourceSettings } from 'codify-plugin-lib';
import { ResourceConfig } from '../../../src/entities/resource-config.js';
import { FileModificationResult } from '../../../src/utils/file-modification-calculator.js';
import { fs, vol } from 'memfs';

vi.mock('../mocks/get-mock-resources.js', async () => {
  return {
    getMockResources: () => ([
      new class extends MockResource {
        getSettings(): ResourceSettings<MockResourceConfig> {
          const orgSettings = super.getSettings();
          return {
            ...orgSettings,
            import: {
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
              "$schema": "http://json-schema.org/draft-07/schema",
              "$id": "https://www.codifycli.com/jenv.json",
              "type": "object",
              "properties": {
                "add": {
                  "type": "array"
                },
                "global": {
                  "type": "string"
                },
                "requiredProp": {
                  "type": "string"
                }
              },
              "required": ["requiredProp"]
            },
            parameterSettings: {
              add: { type: 'array' },
            },
            import: {
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
              "$schema": "http://json-schema.org/draft-07/schema",
              "$id": "https://www.codifycli.com/alias.json",
              "type": "object",
              "properties": {
                "alias": {
                  "type": "string"
                },
                "value": {
                  "type": "string"
                },
              },
              "required": ["alias"]
            },
            parameterSettings: {
              add: { type: 'array' },
            },
            import: {
              requiredParameters: ['alias'],
              refreshKeys: ['alias', 'value'],
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

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs
})

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
})

describe('Import orchestrator tests', () => {
  it('Can import a resource (no project) and can save to a new file', async () => {
    const processSpy = vi.spyOn(process, 'cwd');
    processSpy.mockReturnValue('/')

    const reporter = new MockReporter({
      promptUserForValues: (resourceInfoList): ResourceConfig[] => {
        expect(resourceInfoList.length).to.eq(1);
        expect(resourceInfoList[0].getRequiredParameters()).toEqual(expect.arrayContaining([
          expect.objectContaining({
            name: 'propA',
            type: 'string',
          }),
          expect.objectContaining({
            name: 'propB',
            type: 'number',
          })
        ]))

        return [new ResourceConfig({
          type: 'mock',
          propA: 'randomPropA',
          propB: 'randomPropB'
        })]
      },
      displayImportResult: (importResult) => {
        expect(importResult.errors.length).to.eq(0);
        expect(importResult.result.length).to.eq(1);
        expect(importResult.result[0].type).to.eq('mock');
        expect(importResult.result[0].parameters).toMatchObject({ // Make sure the system values are returned here
          propA: 'currentA',
          propB: 'currentB',
          directory: '~/home',
        })
      },
      // Option 0 is write to a new file (no current project exists)
      promptOptions: (message, options) => {
        expect(options[0]).toContain('new file');
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

    MockOs.create('mock', {
      propA: 'currentA',
      propB: 'currentB',
      directory: '~/home'
    })

    await ImportOrchestrator.run(
      {
        typeIds: ['mock'],
        path: '/'
      },
      reporter,
    );

    expect(askRequiredParametersSpy).toHaveBeenCalledOnce();
    expect(displayImportResultSpy).toHaveBeenCalledOnce()
    expect(displayFileModifications).toHaveBeenCalledOnce();
    expect(promptConfirmationSpy).toHaveBeenCalledOnce();

    const fileWritten = fs.readFileSync('/import.codify.json', 'utf8') as string;
    console.log(fileWritten);

    expect(JSON.parse(fileWritten)).toMatchObject([
      {
        "type": "mock",
        "propA": "currentA",
        "propB": "currentB",
        "directory": "~/home"
      }
    ])
  });

  it('Can import a resource and save it into an existing project', async () => {
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
      { encoding: 'utf-8'});

    const reporter = new MockReporter({
      promptUserForValues: (resourceInfoList): ResourceConfig[] => {
        expect(resourceInfoList.length).to.eq(1);
        expect(resourceInfoList[0].getRequiredParameters()).toEqual(expect.arrayContaining([
          expect.objectContaining({
            name: 'requiredProp',
            type: 'string',
            value: "this-jenv",
            isRequired: true,
          }),
        ]))

        return [new ResourceConfig({
          type: 'jenv',
          requiredProp: true,
        })]
      },
      displayImportResult: (importResult) => {
        console.log(JSON.stringify(importResult, null, 2));
        expect(importResult.errors.length).to.eq(0);
        expect(importResult.result.length).to.eq(1);
        expect(importResult.result[0].type).to.eq('jenv');
        expect(importResult.result[0].parameters).toMatchObject({ // Make sure the system values are returned here
          "add": [
            "system",
            "11",
            "11.0",
            "11.0.24",
            "17",
            "17.0.12",
            "openjdk64-11.0.24",
            "openjdk64-17.0.12"
          ],
          "global": "17",
          "requiredProp": "this-jenv"
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
      "add": [
        "system",
        "11",
        "11.0",
        "11.0.24",
        "17",
        "17.0.12",
        "openjdk64-11.0.24",
        "openjdk64-17.0.12"
      ],
      "global": "17",
      "requiredProp": "this-jenv"
    })

    await ImportOrchestrator.run(
      {
        typeIds: ['jenv'],
        path: '/'
      },
      reporter,
    );

    expect(askRequiredParametersSpy).toHaveBeenCalledOnce();
    expect(displayImportResultSpy).toHaveBeenCalledOnce()
    expect(displayFileModifications).toHaveBeenCalledOnce();
    expect(promptConfirmationSpy).toHaveBeenCalledOnce();

    const fileWritten = fs.readFileSync('/codify.json', 'utf8') as string;
    console.log(fileWritten);

    expect(JSON.parse(fileWritten)).toMatchObject([
      {
        "type": "jenv",
        "add": [
          "system",
          "11",
          "11.0",
          "11.0.24",
          "17",
          "17.0.12",
          "openjdk64-11.0.24",
          "openjdk64-17.0.12"
        ],
        "global": "17",
        "requiredProp": "this-jenv"
      }
    ])
  });

  it('Can import a resource and save it into an existing project (multiple codify files)', async () => {
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
      { encoding: 'utf-8'});

    fs.writeFileSync('/other.codify.json',
      `[
  { "type": "alias", "alias": "gcdsdd", "value": "git clone" },
  {
    "type": "alias",
    "alias": "gcc",
    "value": "git commit -v"
  }
]`,
      { encoding: 'utf-8'});

    const reporter = new MockReporter({
      promptUserForValues: (resourceInfoList): ResourceConfig[] => {
        expect(resourceInfoList.length).to.eq(2);
        expect(resourceInfoList[0].type).to.eq('jenv');
        expect(resourceInfoList[1].type).to.eq('alias');

        return [new ResourceConfig({
          type: 'jenv',
          requiredProp: true,
        }), new ResourceConfig({
          type: 'alias',
          alias: 'gc-new'
        })]
      },
      displayImportResult: (importResult) => {
        expect(importResult.errors.length).to.eq(0);
        expect(importResult.result.length).to.eq(2);
      },
      // Option 0 is write to a new file (no current project exists)
      promptOptions: (message, options) => {
        if (message.includes('save the results?')) {
          expect(options[0]).toContain('Update existing');
          return 0;
        } else if (message.includes('where to write')) {
          expect(options).toMatchObject([
            '/codify.json',
            '/other.codify.json'
          ])
          return 1;
        }
      },
      displayFileModifications: (diff: Array<{ file: string, modification: FileModificationResult }>) => {
        expect(diff[0].file).to.eq('/codify.json')
        expect(diff[1].file).to.eq('/other.codify.json')
      },
    });

    const askRequiredParametersSpy = vi.spyOn(reporter, 'promptUserForValues');
    const displayImportResultSpy = vi.spyOn(reporter, 'displayImportResult');
    const displayFileModifications = vi.spyOn(reporter, 'displayFileModifications');
    const promptConfirmationSpy = vi.spyOn(reporter, 'promptConfirmation');

    MockOs.create('jenv', {
      "add": [
        "system",
        "11",
        "11.0",
        "11.0.24",
        "17",
        "17.0.12",
        "openjdk64-11.0.24",
        "openjdk64-17.0.12"
      ],
      "global": "17",
      "requiredProp": "this-jenv"
    })

    MockOs.create('alias', {
      "alias": 'gc-new',
      "value": 'gc-new-value',
    })

    await ImportOrchestrator.run(
      {
        typeIds: ['jenv', 'alias'],
        path: '/'
      },
      reporter,
    );

    expect(askRequiredParametersSpy).toHaveBeenCalledOnce();
    expect(displayImportResultSpy).toHaveBeenCalledOnce()
    expect(displayFileModifications).toHaveBeenCalledOnce();
    expect(promptConfirmationSpy).toHaveBeenCalledOnce();

    const otherCodifyFile = fs.readFileSync('/other.codify.json', 'utf8') as string;
    console.log(otherCodifyFile);
    expect(JSON.parse(otherCodifyFile)).toMatchObject([
      { "type": "alias", "alias": "gcdsdd", "value": "git clone" },
      {
        "type": "alias",
        "alias": "gcc",
        "value": "git commit -v"
      },
      {
        "type": "alias",
        'alias': 'gc-new',
        'value': 'gc-new-value',
      }
    ])

    const codifyFile = fs.readFileSync('/codify.json', 'utf8') as string;
    console.log(codifyFile);

    expect(JSON.parse(codifyFile)).toMatchObject([
      {
        "type": "jenv",
        "add": [
          "system",
          "11",
          "11.0",
          "11.0.24",
          "17",
          "17.0.12",
          "openjdk64-11.0.24",
          "openjdk64-17.0.12"
        ],
        "global": "17",
        "requiredProp": "this-jenv"
      }
    ])
  });

  it('Can import and update an existing project (without prompting the user)(this is the no args version)', async () => {
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
      { encoding: 'utf-8'});

    const reporter = new MockReporter({
      displayImportResult: (importResult) => {
        console.log(JSON.stringify(importResult, null, 2));
        expect(importResult.errors.length).to.eq(0);
        expect(importResult.result.length).to.eq(1);
        expect(importResult.result[0].type).to.eq('jenv');
        expect(importResult.result[0].parameters).toMatchObject({ // Make sure the system values are returned here
          "add": [
            "system",
            "11",
            "11.0",
            "11.0.24",
            "17",
            "17.0.12",
            "openjdk64-11.0.24",
            "openjdk64-17.0.12"
          ],
          "global": "17",
          "requiredProp": "this-jenv"
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
      "add": [
        "system",
        "11",
        "11.0",
        "11.0.24",
        "17",
        "17.0.12",
        "openjdk64-11.0.24",
        "openjdk64-17.0.12"
      ],
      "global": "17",
      "requiredProp": "this-jenv"
    })

    await ImportOrchestrator.run(
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
        "type": "jenv",
        "add": [
          "system",
          "11",
          "11.0",
          "11.0.24",
          "17",
          "17.0.12",
          "openjdk64-11.0.24",
          "openjdk64-17.0.12"
        ],
        "global": "17",
        "requiredProp": "this-jenv"
      }
    ])
  });

  it('Can import a resource and only display it to the user', async () => {
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
      { encoding: 'utf-8'});

    const reporter = new MockReporter({
      promptUserForValues: (resourceInfoList): ResourceConfig[] => {
        expect(resourceInfoList.length).to.eq(1);
        expect(resourceInfoList[0].getRequiredParameters()).toEqual(expect.arrayContaining([
          expect.objectContaining({
            name: 'requiredProp',
            type: 'string',
            value: "this-jenv",
            isRequired: true,
          }),
        ]))

        return [new ResourceConfig({
          type: 'jenv',
          requiredProp: true,
        })]
      },
      displayImportResult: (importResult, showConfigs, ) => {
        expect(importResult.errors.length).to.eq(0);
        expect(importResult.result.length).to.eq(1);
        expect(importResult.result[0].type).to.eq('jenv');
        expect(importResult.result[0].parameters).toMatchObject({ // Make sure the system values are returned here
          "add": [
            "system",
            "11",
            "11.0",
            "11.0.24",
            "17",
            "17.0.12",
            "openjdk64-11.0.24",
            "openjdk64-17.0.12"
          ],
          "global": "17",
          "requiredProp": "this-jenv"
        })

        if (showConfigs) {
          JSON.stringify(importResult.result.map((r) => r.raw), null, 2)
        }
      },
      // Option 0 is write to a new file (no current project exists)
      promptOptions: (message, options) => {
        expect(options[2]).toContain('No');
        return 2;
      }
    });

    const askRequiredParametersSpy = vi.spyOn(reporter, 'promptUserForValues');
    const displayImportResultSpy = vi.spyOn(reporter, 'displayImportResult');
    const displayFileModifications = vi.spyOn(reporter, 'displayFileModifications');
    const promptConfirmationSpy = vi.spyOn(reporter, 'promptConfirmation');

    MockOs.create('jenv', {
      "add": [
        "system",
        "11",
        "11.0",
        "11.0.24",
        "17",
        "17.0.12",
        "openjdk64-11.0.24",
        "openjdk64-17.0.12"
      ],
      "global": "17",
      "requiredProp": "this-jenv"
    })

    await ImportOrchestrator.run(
      {
        typeIds: ['jenv'],
        path: '/'
      },
      reporter,
    );

    expect(askRequiredParametersSpy).toHaveBeenCalledOnce();
    expect(displayImportResultSpy).toHaveBeenCalledTimes(2);
    expect(displayFileModifications).toHaveBeenCalledTimes(0);
    expect(promptConfirmationSpy).toHaveBeenCalledTimes(0);

    const fileWritten = fs.readFileSync('/codify.json', 'utf8') as string;
    console.log(fileWritten);

    expect(JSON.parse(fileWritten)).toMatchObject([
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
    ])
  });

  afterEach(() => {
    vi.resetAllMocks();
    vol.reset();
    MockOs.reset();
  })

})
