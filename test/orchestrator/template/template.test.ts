import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardApiClient } from '../../../src/api/dashboard/index.js';
import { TemplateCommandsDeclinedError } from '../../../src/common/errors.js';
import { Plan } from '../../../src/entities/plan.js';
import { PlanOrchestrator } from '../../../src/orchestrators/plan.js';
import { TemplateCommandApproval } from '../../../src/templates/template-command-approval.js';
import { prettyFormatPlan } from '../../../src/ui/plan-pretty-printer.js';
import { MockReporter } from '../mocks/reporter.js';
import { mockActionRefreshes } from '../mocks/resource.js';

vi.mock('../../../src/utils/shell.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/utils/shell.js')>();
  return {
    ...actual,
    ShellUtils: {
      ...actual.ShellUtils,
      validateShell: vi.fn(async () => {}),
    },
  }
})

vi.mock('../../../src/plugins/plugin.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { Plugin: MockPlugin };
})

// `codify apply <template>` uses the default plugins (no project block). Resolve every plugin to the mock plugin.
vi.mock('../../../src/plugins/resolver.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { PluginResolver: { resolveAll: vi.fn(async () => [new MockPlugin()]) } };
})

vi.mock('../../../src/api/dashboard/index.js', () => ({
  DashboardApiClient: { getTemplate: vi.fn(), getDocument: vi.fn(), getDefaultDocumentId: vi.fn() },
}));

const TEMPLATES: Record<string, string> = {
  '@codify/mocks': `[
    // Merged with the first project resource (same propA)
    { "type": "mock", "propA": "first", "propB": 2, "array": ["from-template"] },
    { "type": "mock", "propA": "middle", "propB": 3 },
  ]`,
  '@codify/scripts': '[{ "type": "action", "condition": "test -f ~/.done", "action": "curl -fsSL https://example.com/install.sh | sh" }]',
};

const PROJECT = { type: 'project', plugins: { default: './test/orchestrator/mocks/plugin.ts' } };

describe('Template resource (plan orchestrator)', () => {
  let storeDir: string;

  beforeAll(async () => {
    storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-template-test-'));
    vi.spyOn(TemplateCommandApproval, 'defaultStorePath').mockImplementation(() => path.join(storeDir, 'approvals.json'));
    vi.mocked(DashboardApiClient.getTemplate).mockImplementation(async (name: string) => TEMPLATES[name] === undefined ? null : {
      id: name, name, displayName: name, description: null, rawConfigs: TEMPLATES[name],
    });
  });

  afterAll(async () => {
    await fs.rm(storeDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    mockActionRefreshes.length = 0;
    vi.mocked(DashboardApiClient.getTemplate).mockClear();
  });

  it('merges the plan of the template into the overall plan at the position of the template', async () => {
    let displayedPlan: Plan | undefined;
    const { plan, project } = await PlanOrchestrator.run({
      codifyConfigs: [
        PROJECT,
        { type: 'mock', propA: 'first', propB: 1, array: ['mine'] },
        { type: 'template', source: '@codify/mocks' },
        { type: 'mock', propA: 'last', propB: 4 },
      ] as never,
    }, new MockReporter({ validatePlan: (p) => { displayedPlan = p; } }));

    const order = project.evaluationOrder!.filter((id) => id !== 'xcode-tools');
    expect(order.map((id) => project.findSpecific(...(id.split('.') as [string, string]))!.parameters.propA))
      .toEqual(['first', 'middle', 'last']);

    // The template resource was merged into the project resource: arrays combined, the project value wins
    const first = project.resourceConfigs.find((r) => r.parameters.propA === 'first')!;
    expect(first.parameters).toMatchObject({ propB: 1, array: ['mine', 'from-template'] });

    expect(plan.resources.filter((r) => r.resourceType === 'mock')).toHaveLength(3);
    expect(plan.warnings).toEqual([expect.stringContaining('"propB" is declared with different values')]);
    expect(displayedPlan?.warnings).toHaveLength(1);

    const middle = project.resourceConfigs.find((r) => r.parameters.propA === 'middle')!;
    const printed = prettyFormatPlan(plan);
    expect(printed).toContain(`${middle.id} will be created`);
    expect(printed).toContain('(from template @codify/mocks)');
  });

  it('does not run anything from a template action before the user approves it', async () => {
    const prompt = vi.fn(() => false);

    await expect(PlanOrchestrator.run({
      codifyConfigs: [PROJECT, { type: 'template', source: '@codify/scripts' }] as never,
    }, new MockReporter({ promptTemplateCommandApproval: prompt }))).rejects.toThrow(TemplateCommandsDeclinedError);

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(mockActionRefreshes).toEqual([]);
  });

  it('plans template actions once approved', async () => {
    const { plan } = await PlanOrchestrator.run({
      codifyConfigs: [PROJECT, { type: 'template', source: '@codify/scripts' }] as never,
    }, new MockReporter({ promptTemplateCommandApproval: () => true }));

    expect(plan.getResourcePlan('action')).toBeTruthy();
    expect(mockActionRefreshes).toEqual(['curl -fsSL https://example.com/install.sh | sh']);

    // Remembered: not asked again
    const prompt = vi.fn(() => false);
    await PlanOrchestrator.run({
      codifyConfigs: [PROJECT, { type: 'template', source: '@codify/scripts' }] as never,
    }, new MockReporter({ promptTemplateCommandApproval: prompt }));
    expect(prompt).not.toHaveBeenCalled();
  });

  it('plans a template passed directly to the command (codify apply <template>)', async () => {
    const { plan, project } = await PlanOrchestrator.run({ path: '@codify/mocks' }, new MockReporter());

    expect(project.templateName).toBe('@codify/mocks');
    expect(project.resourceConfigs.filter((r) => r.type === 'mock').map((r) => r.parameters.propA)).toEqual(['first', 'middle']);
    expect(project.resourceConfigs.every((r) => r.type === 'xcode-tools' || r.isFromTemplatesOnly)).toBe(true);
    expect(plan.resources.filter((r) => r.resourceType === 'mock')).toHaveLength(2);
    // Fetched once by the resolver and reused by the template expander
    expect(DashboardApiClient.getTemplate).toHaveBeenCalledTimes(1);
  });
});
