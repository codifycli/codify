import { beforeEach, describe, expect, it } from 'vitest';

import { PluginResolver } from '../../src/plugins/resolver.js';
import mock from 'mock-fs';
import * as fs from 'fs';

describe('Plugin resolver integration test', () => {
  beforeEach(() => {
    mock({
      '/Library/Caches/codify/plugins': {}
    })

  })

  it('resolves the default plugin', async () => {
    const plugin = await PluginResolver.resolve('default')

    expect(fs.existsSync('/Library/Caches/codify/plugins/default.js')).to.be.true;
  })
})
