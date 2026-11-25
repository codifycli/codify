import { describe, expect, it } from 'vitest';

import { describeToolCall } from '../../src/prompt/ui/tool-summary.js';

describe('describeToolCall', () => {
  it('lists every type and query of the batched registry lookups', () => {
    expect(describeToolCall('get_resource_schema', { types: ['nvm', 'homebrew'] })).toBe('Look up nvm, homebrew');
    expect(describeToolCall('search_resources', { queries: ['docker', 'node version manager'] }))
      .toBe('Search resources: docker, node version manager');
  });

  it('still reads the older single-value arguments', () => {
    expect(describeToolCall('get_resource_schema', { type: 'nvm' })).toBe('Look up nvm');
    expect(describeToolCall('search_resources', { query: 'docker' })).toBe('Search resources: docker');
  });
});
