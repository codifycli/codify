import { Console } from 'node:console';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResourceConfig } from '../../src/entities/resource-config.js';
import { VariableConfig } from '../../src/entities/variable-config.js';
import { VariableFormPrompt } from '../../src/ui/components/variable-form/variable-form.js';
import { VariableForm, VariableResolver } from '../../src/variables/variable-resolver.js';
import { cleanup, render } from './helpers/ink-testing-library.js';

// Polyfill console.Console for the test environment (required by patch-console/Ink)
if (!console.Console) {
  // @ts-expect-error - Polyfilling console.Console for test environment
  console.Console = Console;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
const KEY = { up: '\u001B[A', down: '\u001B[B', right: '\u001B[C', left: '\u001B[D', enter: '\r', backspace: '\u007F', escape: '\u001B' };
// eslint-disable-next-line no-control-regex
const plain = (frame: string | undefined) => (frame ?? '').replaceAll(/\u001B\[[\d;]*m/g, '');

const variable = (config: Record<string, unknown>) => new VariableConfig({ type: 'variable', ...config } as never);

/** The form a real VariableResolver shows for these declarations (the resolver waits forever for the answers) */
function formFor(declarations: unknown[]): Promise<VariableForm> {
  return new Promise((resolve) => {
    new VariableResolver(async () => { throw new Error('not asked one by one'); }, [], (form) => {
      resolve(form);
      return new Promise(() => {});
    }).resolveScope(declarations as never, { labels: [], location: 'codify.jsonc' }).catch(() => {});
  });
}

describe('Variable form', () => {
  afterEach(() => cleanup());

  const declarations = () => [
    variable({ name: 'siteType', valueType: 'enum', options: ['blog', 'portfolio'], label: 'What kind of site are you building?', description: 'Each kind comes with its own tools' }),
    variable({ name: 'projectName', description: 'The name of the project' }),
    variable({ name: 'cssFramework', valueType: 'enum', options: ['tailwind', 'none'], default: 'tailwind', when: { siteType: 'portfolio' } }),
    variable({ name: 'apiName', default: '${{ projectName }}-api' }),
    variable({ name: 'useTs', valueType: 'boolean', default: true }),
    variable({ name: 'tools', valueType: 'multiEnum', options: ['docker', 'kubectl'], default: [] }),
    new ResourceConfig({ type: 'git-repository', directory: '~/${{ projectName }}', token: '${{ token }}' }),
  ];

  it('shows every question on one screen and lets previous answers be edited', async () => {
    const form = await formFor(declarations());
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(<VariableFormPrompt form={form} onCancel={() => {}} onSubmit={onSubmit}/>);
    await tick();

    // Every question is there, the first one is focused
    let frame = plain(lastFrame());
    expect(frame).toContain('Configure  codify.jsonc');
    // The label is the question, the name is shown next to it
    expect(frame).toContain('◆  What kind of site are you building?  siteType');
    expect(frame).toContain('Each kind comes with its own tools');
    expect(frame).toContain('● blog   ○ portfolio');
    expect(frame).toContain('○  projectName  —');
    expect(frame).toContain('◇  useTs  Yes');
    // Implicit variables (used without a variable block) are asked as well
    expect(frame).toContain('token');
    // Only asked for portfolios
    expect(frame).not.toContain('cssFramework');

    // Picking portfolio shows the question that depends on it
    stdin.write(KEY.right);
    await tick();
    frame = plain(lastFrame());
    expect(frame).toContain('○ blog   ● portfolio');
    expect(frame).toContain('cssFramework  tailwind');

    // Next question: type a name. The default of apiName follows it.
    stdin.write(KEY.enter);
    await tick();
    stdin.write('site');
    await tick();
    frame = plain(lastFrame());
    expect(frame).toContain('◇  What kind of site are you building?  portfolio');
    expect(frame).toContain('◆  projectName');
    expect(frame).toContain('site');
    expect(frame).toContain('apiName  site-api');

    // Back to the first question: change the answer, cssFramework goes away
    stdin.write(KEY.up);
    await tick();
    stdin.write(KEY.left);
    await tick();
    frame = plain(lastFrame());
    expect(frame).toContain('● blog   ○ portfolio');
    expect(frame).not.toContain('cssFramework');
    expect(frame).toContain('projectName  site');

    // The token is required: submitting stops on it with an error
    for (let i = 0; i < 8; i++) {
      stdin.write(KEY.enter);
      // eslint-disable-next-line no-await-in-loop
      await tick();
    }

    frame = plain(lastFrame());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(frame).toContain('▲  token');
    expect(frame).toContain('A value is required');

    stdin.write('secret');
    await tick();
    stdin.write(KEY.enter);
    await tick();

    expect(onSubmit).toHaveBeenCalledWith({ siteType: 'blog', projectName: 'site', token: 'secret' });
  });

  it('validates answers when leaving a field and toggles multiple options', async () => {
    const form = await formFor([
      variable({ name: 'port', valueType: 'number' }),
      variable({ name: 'tools', valueType: 'multiEnum', options: ['docker', 'kubectl'] }),
      new ResourceConfig({ type: 'a', p: '${{ port }}', t: '${{ tools }}' }),
    ]);
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(<VariableFormPrompt form={form} onCancel={() => {}} onSubmit={onSubmit}/>);
    await tick();

    stdin.write('abc');
    await tick();
    stdin.write(KEY.down);
    await tick();
    expect(plain(lastFrame())).toContain('"abc" is not a number');

    stdin.write(KEY.right);
    await tick();
    stdin.write(' ');
    await tick();
    expect(plain(lastFrame())).toContain('□ docker   ■ kubectl');

    stdin.write(KEY.up);
    await tick();
    for (let i = 0; i < 3; i++) {
      stdin.write(KEY.backspace);
      // eslint-disable-next-line no-await-in-loop
      await tick();
    }
    stdin.write('8080');
    await tick();
    stdin.write(KEY.enter);
    await tick();
    stdin.write(KEY.enter);
    await tick();

    expect(onSubmit).toHaveBeenCalledWith({ port: '8080', tools: ['kubectl'] });
  });

  it('cancels with escape', async () => {
    const form = await formFor([variable({ name: 'a' }), new ResourceConfig({ type: 'x', p: '${{ a }}' })]);
    const onCancel = vi.fn();
    const { stdin } = render(<VariableFormPrompt form={form} onCancel={onCancel} onSubmit={() => {}}/>);
    await tick();

    stdin.write(KEY.escape);
    await tick();
    await tick();
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('VariableResolver with a form', () => {
  it('asks for the variables of a scope on one form and applies the answers', async () => {
    const asked = vi.fn();
    const forms: VariableForm[] = [];
    const resource = new ResourceConfig({ type: 'a', dir: '~/${{ projectName }}', api: '${{ apiName }}', port: '${{ port }}' });

    const resolver = new VariableResolver(asked, [{ scope: [], name: 'port', value: '9000' }], async (form) => {
      forms.push(form);
      return { projectName: 'site' };
    });

    await resolver.resolveScope([
      variable({ name: 'projectName' }),
      variable({ name: 'apiName', default: '${{ projectName }}-api' }),
      variable({ name: 'port', valueType: 'number' }),
      resource,
    ] as never, { labels: [], location: 'codify.jsonc' });

    // Presets are not shown on the form, defaults are used for empty answers
    expect(forms).toHaveLength(1);
    expect(forms[0].fields({}).map((f) => f.name)).toEqual(['projectName', 'apiName']);
    expect(forms[0].fields({ projectName: 'x' })[1].default).toBe('x-api');
    expect(forms[0].validate('projectName', '', {})).toBe('A value is required');
    expect(forms[0].validate('apiName', '', { projectName: 'x' })).toBeUndefined();
    // The default needs projectName
    expect(forms[0].validate('apiName', '', {})).toBe('A value is required');
    expect(asked).not.toHaveBeenCalled();
    expect(resource.parameters).toEqual({ dir: '~/site', api: 'site-api', port: 9000 });
  });

  it('does not show a form when nothing needs a value', async () => {
    const formPrompter = vi.fn();
    await new VariableResolver(async () => 'x', [], formPrompter).resolveScope(
      [new ResourceConfig({ type: 'a', p: 'no variables' })] as never,
      { labels: [], location: 'codify.jsonc' },
    );

    expect(formPrompter).not.toHaveBeenCalled();
  });
});
