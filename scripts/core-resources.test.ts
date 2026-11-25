import { describe, expect, it } from 'vitest';

import { ConfigType } from '../src/entities/config.js';
import { CodifyParser } from '../src/parser/index.js';
import { CORE_RESOURCES, toRegistrySchema } from './core-resources.js';

// Every core block of the CLI (ConfigType without the internal "resource" class)
const CORE_TYPES = Object.values(ConfigType).filter((t) => t !== ConfigType.RESOURCE).sort();

describe('Core resources for the resource library', () => {
  it('lists every core config block once', () => {
    expect(CORE_RESOURCES.map((r) => r.type).sort()).toEqual(CORE_TYPES);
  });

  it('uses the schema of each block', () => {
    for (const resource of CORE_RESOURCES) {
      const schema = toRegistrySchema(resource.schema);
      expect((schema.properties as Record<string, { const?: string }>).type.const).toBe(resource.type);
      expect(schema.$id).toBeUndefined();
      expect(schema.$schema).toBeUndefined();
    }
  });

  it('has default configs and examples that the CLI accepts', async () => {
    for (const resource of CORE_RESOURCES) {
      const { example1, example2 } = resource.exampleConfigs;
      for (const example of [example1, example2].filter((e) => e !== undefined)) {
        expect(example.title.length, `${resource.type}: ${example.title}`).toBeGreaterThan(0);
        expect(example.description.length).toBeGreaterThan(0);
        expect(example.configs.some((c) => c.type === resource.type)).toBe(true);
        await expect(CodifyParser.parseJson(example.configs as never), `${resource.type}: ${example.title}`).resolves.toBeDefined();
      }

      // Defaults may hold placeholders ('<Replace me here!>') that the user replaces, so they don't have to be valid,
      // but they may only use parameters of the block
      const properties = Object.keys(toRegistrySchema(resource.schema).properties as object);
      expect(Object.keys(resource.defaultConfig).filter((k) => !properties.includes(k)), resource.type).toEqual([]);
    }
  });
});
