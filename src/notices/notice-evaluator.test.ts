import { NoticeLevel, ResourceOperation, ResourceOs } from '@codifycli/schemas';
import chalk from 'chalk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VariableError } from '../common/errors.js';
import { type ApplyResult, type ApplyResultEntry } from '../entities/apply-result.js';
import { NoticeConfig } from '../entities/notice-config.js';
import { Project } from '../entities/project.js';
import { TemplateConfig } from '../entities/template-config.js';
import { FileType, InMemoryFile } from '../parser/entities.js';
import { CodifyParser } from '../parser/index.js';
import { TemplateExpander } from '../templates/template-expander.js';
import { TemplateLoader } from '../templates/template-loader.js';
import { formatNotices, splitInlineCode } from '../ui/notice-formatter.js';
import { OsUtils } from '../utils/os-utils.js';
import { VariablePromptRequest, VariableResolver } from '../variables/variable-resolver.js';
import { NoticeEvaluator } from './notice-evaluator.js';

vi.mock('../api/dashboard/index.js', () => ({
  DashboardApiClient: { getTemplate: vi.fn(), getDocument: vi.fn() },
}));

function fakeLoader(templates: Record<string, unknown[]>): TemplateLoader {
  return {
    async load(template: TemplateConfig): Promise<InMemoryFile> {
      const contents = templates[template.source];
      if (contents === undefined) {
        throw new Error(`Unknown template ${template.source}`);
      }

      return { contents: JSON.stringify(contents), filePath: `template:${template.source}`, fileType: FileType.JSONC };
    }
  };
}

async function expand(
  configs: unknown[],
  templates: Record<string, unknown[]> = {},
  values: Record<string, unknown> = {},
): Promise<Project> {
  const project = await CodifyParser.parseJson(configs as never);
  const prompter = async (request: VariablePromptRequest) => values[request.name];
  await new TemplateExpander(fakeLoader(templates)).expand(project, new VariableResolver(prompter));
  return project;
}

function applyResult(entries: Array<Partial<ApplyResultEntry> & { id: string }>): ApplyResult {
  const full = entries.map((e) => ({ operation: ResourceOperation.CREATE, status: 'success' as const, ...e }));
  return {
    entries: full,
    errors: [],
    notes: [],
    notices: [],
    isPartialFailure: () => full.some((e) => e.status === 'failed'),
  };
}

const messages = (notices: Array<{ message: string }>) => notices.map((n) => n.message);

describe('Notices', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses notices with their defaults and keeps them out of the resources', async () => {
    const project = await expand([
      { type: 'npm' },
      { type: 'notice', message: 'Run `npm run dev`' },
      { type: 'notice', title: 'Careful', message: 'Do not run as root', level: 'warning', stage: 'plan' },
    ]);

    expect(project.resourceConfigs.map((r) => r.id)).toEqual(['npm']);
    expect(project.noticeConfigs.map((n) => [n.level, n.stage, n.show])).toEqual([
      ['info', 'apply', 'onChange'],
      ['warning', 'plan', 'onChange'],
    ]);
  });

  it('rejects invalid notices', async () => {
    await expect(CodifyParser.parseJson([{ type: 'notice' }] as never)).rejects.toThrow(/invalid notice config/);
    await expect(CodifyParser.parseJson([{ type: 'notice', message: 'a', stage: 'plan', show: 'always' }] as never))
      .rejects.toThrow(/invalid notice config/);
  });

  it('includes the notices of templates and remembers where they come from', async () => {
    const project = await expand([
      { type: 'notice', message: 'project' },
      { type: 'template', name: 'blog', source: '@codify/astro-blog' },
      { type: 'template', name: 'docs', source: '@codify/astro-blog' },
    ], {
      '@codify/astro-blog': [{ type: 'node' }, { type: 'notice', message: 'template' }],
    });

    // Included twice, added once
    expect(messages(project.noticeConfigs)).toEqual(['project', 'template']);
    expect(project.noticeConfigs[0].templateSource).toBeUndefined();
    expect(project.noticeConfigs[1].templateSource).toBe('@codify/astro-blog');
    expect(project.noticeConfigs[1].origins).toHaveLength(2);
  });

  it('replaces variable references and removes notices whose when does not match', async () => {
    const project = await expand([
      { type: 'variable', name: 'siteType', valueType: 'enum', options: ['blog', 'shop'] },
      { type: 'template', source: 'site', variables: { dir: '~/projects/${{ siteType }}' } },
    ], {
      site: [
        { type: 'variable', name: 'dir' },
        { type: 'notice', title: 'Your ${{ dir }}', message: 'cd ${{ dir }} && npm run dev' },
      ],
    }, { siteType: 'blog' });

    expect(project.noticeConfigs.map((n) => [n.title, n.message])).toEqual([
      ['Your ~/projects/blog', 'cd ~/projects/blog && npm run dev'],
    ]);
  });

  it('applies when conditions on notices', async () => {
    const project = await expand([
      { type: 'variable', name: 'siteType', valueType: 'enum', options: ['blog', 'shop'] },
      { type: 'notice', message: 'blog', when: { siteType: 'blog' } },
      { type: 'notice', message: 'shop', when: { siteType: 'shop' } },
    ], {}, { siteType: 'shop' });

    expect(messages(project.noticeConfigs)).toEqual(['shop']);
  });

  it('asks for variables that are only referenced by a notice', async () => {
    const project = await expand([
      { type: 'notice', message: 'Hi ${{ userName }}' },
    ], {}, { userName: 'Ada' });

    expect(messages(project.noticeConfigs)).toEqual(['Hi Ada']);
    expect(project.implicitVariables).toEqual(['userName']);
  });

  it('does not allow sensitive variables in notices', async () => {
    await expect(expand([
      { type: 'variable', name: 'token', sensitive: true },
      { type: 'notice', message: 'Your token is ${{ token }}' },
    ], {}, { token: 'secret' })).rejects.toThrow(VariableError);
  });

  it('does not allow secrets in notices but allows saved variables', async () => {
    const resolver = new VariableResolver(async () => { throw new Error('not asked'); }, [
      { scope: [], name: 'secrets.user.T', value: 'tok_123456' },
      { scope: [], name: 'vars.org.R', value: 'eu' },
    ], undefined, { sensitiveKeys: new Set(['secrets.user.T']), hints: new Map() });
    const scope = { labels: [], location: 'codify.jsonc' };

    await expect(resolver.resolveScope([
      new NoticeConfig({ type: 'notice', message: 'Your token: ${{ secrets.user.T }}' }),
    ], scope)).rejects.toThrow(/secrets.user.T/);

    const notice = new NoticeConfig({ type: 'notice', message: 'Region: ${{ vars.org.R }}' });
    await resolver.resolveScope([notice], scope);
    expect(notice.message).toBe('Region: eu');
  });

  it('removes notices that do not apply to this os', async () => {
    vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.LINUX);

    const project = await expand([
      { type: 'notice', message: 'mac', os: ['macOS'] },
      { type: 'notice', message: 'linux', os: ['linux'] },
      { type: 'template', source: 'mac-only', os: ['macOS'] },
    ], { 'mac-only': [{ type: 'notice', message: 'from mac template' }] });
    project.removeResourcesUsingOsFilter();

    expect(messages(project.noticeConfigs)).toEqual(['linux']);
  });

  describe('NoticeEvaluator', () => {
    it('shows plan notices with the plan and apply notices after the apply', async () => {
      const project = await expand([
        { type: 'npm' },
        { type: 'notice', message: 'before', stage: 'plan' },
        { type: 'notice', message: 'after' },
      ]);

      expect(messages(NoticeEvaluator.forPlan(project))).toEqual(['before']);
      expect(messages(NoticeEvaluator.forApply(project, applyResult([{ id: 'npm' }])))).toEqual(['after']);
    });

    it('shows onChange notices only if one of the resources of their template changed', async () => {
      const project = await expand([
        { type: 'git' },
        { type: 'template', source: 'react' },
        { type: 'template', source: 'astro' },
      ], {
        react: [{ type: 'node' }, { type: 'template', source: 'editor' }, { type: 'notice', message: 'react' }],
        editor: [{ type: 'vscode' }],
        astro: [{ type: 'pnpm' }, { type: 'notice', message: 'astro' }],
      });

      // A resource of a nested template counts for the outer template
      expect(messages(NoticeEvaluator.forApply(project, applyResult([{ id: 'vscode' }])))).toEqual(['react']);
      expect(messages(NoticeEvaluator.forApply(project, applyResult([{ id: 'pnpm' }])))).toEqual(['astro']);
      expect(messages(NoticeEvaluator.forApply(project, applyResult([{ id: 'git' }])))).toEqual([]);
      // Nothing changed
      expect(messages(NoticeEvaluator.forApply(project))).toEqual([]);
    });

    it('shows project notices if anything changed', async () => {
      const project = await expand([
        { type: 'git' },
        { type: 'template', source: 't' },
        { type: 'notice', message: 'summary' },
      ], { t: [{ type: 'node' }] });

      expect(messages(NoticeEvaluator.forApply(project, applyResult([{ id: 'node' }])))).toEqual(['summary']);
      expect(messages(NoticeEvaluator.forApply(project))).toEqual([]);
    });

    it('shows always notices when nothing changed', async () => {
      const project = await expand([
        { type: 'git' },
        { type: 'notice', message: 'always', show: 'always' },
        { type: 'notice', message: 'onChange' },
      ]);

      expect(messages(NoticeEvaluator.forApply(project))).toEqual(['always']);
    });

    it('hides notices if one of their resources failed or was skipped', async () => {
      const project = await expand([
        { type: 'git' },
        { type: 'template', source: 't' },
      ], { t: [{ type: 'node' }, { type: 'pnpm' }, { type: 'notice', message: 't', show: 'always' }] });

      expect(messages(NoticeEvaluator.forApply(project, applyResult([
        { id: 'node' }, { id: 'pnpm', status: 'failed' },
      ])))).toEqual([]);
      expect(messages(NoticeEvaluator.forApply(project, applyResult([
        { id: 'node' }, { id: 'pnpm', status: 'skipped', operation: ResourceOperation.NOOP },
      ])))).toEqual([]);
      // A failure elsewhere doesn't matter
      expect(messages(NoticeEvaluator.forApply(project, applyResult([
        { id: 'node' }, { id: 'git', status: 'failed' },
      ])))).toEqual(['t']);
    });

    it('uses dependsOn instead of the resources of the template', async () => {
      const project = await expand([
        { type: 'git' },
        { type: 'template', name: 'site', source: 't' },
        { type: 'notice', message: 'git', dependsOn: ['git'] },
        { type: 'notice', message: 'site', dependsOn: ['template.site'] },
      ], { t: [{ type: 'node' }] });

      expect(messages(NoticeEvaluator.forApply(project, applyResult([{ id: 'git' }])))).toEqual(['git']);
      expect(messages(NoticeEvaluator.forApply(project, applyResult([{ id: 'node' }])))).toEqual(['site']);
    });

    it('throws for dependsOn references that do not exist', async () => {
      const project = await expand([
        { type: 'git' },
        { type: 'notice', message: 'typo', dependsOn: ['gti'] },
      ]);

      expect(() => NoticeEvaluator.forPlan(project)).toThrow(/dependsOn reference "gti" was not found/);
    });

    it('hides notices whose dependsOn only points to resources that do not apply here', async () => {
      vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.LINUX);

      const project = await expand([
        { type: 'homebrew', os: ['macOS'] },
        { type: 'git' },
        { type: 'notice', message: 'brew', dependsOn: ['homebrew'], show: 'always' },
        { type: 'notice', message: 'brew plan', dependsOn: ['homebrew'], stage: 'plan' },
      ]);
      project.removeResourcesUsingOsFilter();

      expect(NoticeEvaluator.forPlan(project)).toEqual([]);
      expect(NoticeEvaluator.forApply(project)).toEqual([]);
    });

    it('shows notices of a template without resources when anything was applied', async () => {
      const project = await expand([
        { type: 'git' },
        { type: 'template', source: 'tips' },
      ], { tips: [{ type: 'notice', message: 'tip' }] });

      expect(messages(NoticeEvaluator.forApply(project, applyResult([{ id: 'git' }])))).toEqual(['tip']);
      expect(messages(NoticeEvaluator.forApply(project))).toEqual([]);
    });

    it('removes terminal control characters', async () => {
      const project = await expand([
        { type: 'git' },
        { type: 'notice', title: '\u001B[2JTitle', message: 'line 1\n\tline 2\u001B]0;evil\u0007\u0008' },
      ]);

      const [notice] = NoticeEvaluator.forApply(project, applyResult([{ id: 'git' }]));
      expect(notice).toEqual({ title: 'Title', message: 'line 1\n\tline 2', level: NoticeLevel.INFO, template: undefined });
    });
  });

  describe('formatting', () => {
    it('splits inline code', () => {
      expect(splitInlineCode('Run `npm i` then `npm run dev`. A ` alone')).toEqual([
        { code: false, text: 'Run ' },
        { code: true, text: 'npm i' },
        { code: false, text: ' then ' },
        { code: true, text: 'npm run dev' },
        { code: false, text: '. A ` alone' },
      ]);
    });

    it('formats notices as text', () => {
      const level = chalk.level;
      chalk.level = 0;
      try {
        expect(formatNotices([
          { title: 'Get started', message: 'cd site\n`npm run dev`', level: NoticeLevel.SUCCESS, template: '@codify/astro' },
          { message: 'Do not run as root', level: NoticeLevel.WARNING },
        ])).toBe([
          '✔ Get started (from template @codify/astro)',
          '  cd site',
          '  npm run dev',
          '',
          '⚠ Warning',
          '  Do not run as root',
        ].join('\n'));
      } finally {
        chalk.level = level;
      }
    });
  });
});
