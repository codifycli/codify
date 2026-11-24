import { describe, expect, it, vi } from 'vitest';

import { TemplateUsage } from './template-usage.js';

const template = { id: 't-1', name: 'nvm', fullName: '@codify/nvm', displayName: 'NVM', description: null, rawConfigs: '[]', version: '1.2.0', versionId: 'v-1' };

describe('TemplateUsage', () => {
  it('records each template version once and resets between runs', () => {
    const usage = new TemplateUsage();
    usage.record(template);
    usage.record(template);
    expect(usage.list()).toEqual([{ fullName: '@codify/nvm', id: 't-1', version: '1.2.0', versionId: 'v-1' }]);

    usage.reset();
    expect(usage.list()).toEqual([]);
  });

  it('sends the template, version and result only', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const usage = new TemplateUsage(fetchImpl as never);
    usage.record(template);

    await usage.report('apply_succeeded', undefined, true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/rest\/v1\/rpc\/record_template_event$/);
    expect(JSON.parse(init.body as string)).toEqual({ p_template_id: 't-1', p_kind: 'apply_succeeded', p_surface: 'cli', p_version_id: 'v-1' });
  });

  it('sends nothing when turned off or without templates', async () => {
    const fetchImpl = vi.fn();
    const usage = new TemplateUsage(fetchImpl as never);
    await usage.report('apply_started', undefined, true);
    usage.record(template);
    await usage.report('apply_started', undefined, false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never throws when the registry cannot be reached', async () => {
    const usage = new TemplateUsage(vi.fn(async () => { throw new Error('offline'); }) as never);
    usage.record(template);
    await expect(usage.report('apply_failed', undefined, true)).resolves.toBeUndefined();
  });

  it('respects DO_NOT_TRACK and CODIFY_DISABLE_TEMPLATE_STATS', () => {
    const before = { ...process.env };
    delete process.env.VITEST;
    try {
      process.env.DO_NOT_TRACK = '1';
      expect(TemplateUsage.enabled).toBe(false);
      delete process.env.DO_NOT_TRACK;
      process.env.CODIFY_DISABLE_TEMPLATE_STATS = 'true';
      expect(TemplateUsage.enabled).toBe(false);
      delete process.env.CODIFY_DISABLE_TEMPLATE_STATS;
      expect(TemplateUsage.enabled).toBe(true);
    } finally {
      process.env = before;
    }
  });
});
