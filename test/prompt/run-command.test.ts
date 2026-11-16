import { describe, expect, it, vi } from 'vitest';

import { runCommandTool, type RunCommandHost } from '../../src/prompt/tools/run-command.js';

function host(overrides: Partial<RunCommandHost> = {}): RunCommandHost {
  return {
    requestApproval: vi.fn(async () => false),
    getSudoPassword: vi.fn(async () => undefined),
    setReporterSilent: vi.fn(),
    ...overrides,
  };
}

describe('runCommandTool', () => {
  it('runs read-only commands without asking', async () => {
    const h = host();
    const result = await runCommandTool({ command: 'echo codify-ok' }, h);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('codify-ok');
    expect(h.requestApproval).not.toHaveBeenCalled();
    expect(h.setReporterSilent).toHaveBeenNthCalledWith(1, true);
    expect(h.setReporterSilent).toHaveBeenLastCalledWith(false);
  });

  it('does not run a command the user declines', async () => {
    const h = host();
    const result = await runCommandTool({ command: 'touch /tmp/codify-should-not-exist', reason: 'test' }, h);
    expect(h.requestApproval).toHaveBeenCalledWith(expect.objectContaining({ asRoot: false }));
    expect(result.declined).toMatch(/declined/);
    expect(result.exitCode).toBeUndefined();
  });

  it('runs an approved command', async () => {
    const h = host({ requestApproval: vi.fn(async () => true) });
    const result = await runCommandTool({ command: 'echo approved > /dev/stdout' }, h);
    expect(result.output).toContain('approved');
  });

  it('asks for approval and a password before sudo, and stops without a password', async () => {
    const h = host({ requestApproval: vi.fn(async () => true) });
    const result = await runCommandTool({ command: 'sudo ls /' }, h);
    expect(h.requestApproval).toHaveBeenCalledWith(expect.objectContaining({ asRoot: true }));
    expect(h.getSudoPassword).toHaveBeenCalledWith('ls /');
    expect(result.declined).toMatch(/password/);
  });

  it('refuses sudo in the middle of a command without asking', async () => {
    const h = host();
    const result = await runCommandTool({ command: 'ls && sudo rm -rf /' }, h);
    expect(h.requestApproval).not.toHaveBeenCalled();
    expect(result.declined).toMatch(/sudo/);
  });
});
