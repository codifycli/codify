import path from 'path';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { MockReporter } from '../mocks/reporter.js';
import { ImportOrchestrator } from '../../../src/orchestrators/import.js';
import { MockResource, MockResourceConfig } from '../mocks/resource.js';
import { ResourceSettings } from 'codify-plugin-lib';

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
      }
    ])
  }
})

vi.mock('../../../src/plugins/plugin.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { Plugin: MockPlugin };
})

describe('Import orchestrator tests', () => {
  it('Can import a resource', async () => {
    const reporter = new MockReporter({
      askRequiredParametersForImport: (requiredParameters) => {
        expect(requiredParameters.get('mock')?.length).to.eq(2);
        expect(requiredParameters.get('mock')).toEqual(expect.arrayContaining([
          expect.objectContaining({
            name: 'propA',
            type: 'string',
          }),
          expect.objectContaining({
            name: 'propB',
            type: 'number',
          })
        ]))

        return new Map([
          ['mock', { propA: 'randomPropA', propB: 'randomPropB' }], // User supplied values
        ]);
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
      }
    });

    const askRequiredParametersSpy = vi.spyOn(reporter, 'promptUserForParameterValues');
    const displayImportResultSpy = vi.spyOn(reporter, 'displayImportResult');

    MockOs.create('mock', {
      propA: 'currentA',
      propB: 'currentB',
      directory: '~/home'
    })

    await ImportOrchestrator.run(
      {
        typeIds: ['mock'],
        path: path.join(__dirname, 'codify.json')
      },
      reporter,
    );

    expect(askRequiredParametersSpy).toHaveBeenCalledOnce();
    expect(displayImportResultSpy).toHaveBeenCalledOnce();
  });

  afterEach(() => {
    vi.resetAllMocks();
    MockOs.reset();
  })

})
