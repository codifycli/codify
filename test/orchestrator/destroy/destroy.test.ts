import path from 'path';
import { DestroyOrchestrator } from '../../../src/orchestrators/destroy.js';
import { MockReporter } from '../mocks/reporter.js';
import { describe, it, vi, afterEach, expect } from 'vitest';
import { MockSystem } from '../mocks/system';

vi.mock('../../../src/plugins/plugin.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { Plugin: MockPlugin };
})

describe('Can destroy a resource (simple, no required attributes, from Codify.json)', () => {
  it('Can start', { timeout: 3000000 }, async () => {
    const reporter = new MockReporter();
    MockSystem.create('mock', {
      propA: 'current',
      propB: 1,
      array: ['a', 'b', 'c'],
      directory: '~/home'
    })

    expect(MockSystem.get('mock')).to.toMatchObject({ propA: 'current' })

    await DestroyOrchestrator.run({
      ids: ['mock'],
      path: path.join(__dirname, 'codify.json')
    }, reporter)

    expect(MockSystem.get('mock')).to.be.undefined;
  })

  afterEach(() => {
    vi.resetAllMocks();
    MockSystem.reset();
  })

})
