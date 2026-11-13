import { describe, expect, it } from 'vitest';

import { CodifyParser } from './index.js';

describe('CodifyParser.parseTemplate', () => {
  it('parses a JSONC template into a read-only project', async () => {
    const project = await CodifyParser.parseTemplate({
      id: 't1',
      name: 'nvm',
      displayName: 'NVM',
      description: null,
      rawConfigs: `[
        // Install node via nvm
        { "type": "nvm", "global": "20" },
      ]`,
    });

    expect(project.templateName).toBe('nvm');
    expect(project.codifyFiles).toEqual([]);
    expect(project.exists()).toBe(false);
    expect(project.isTemplate()).toBe(true);
    expect(project.isRemote()).toBe(false);
    expect(project.resourceConfigs.map((r) => r.type)).toEqual(['nvm']);
  });
});
