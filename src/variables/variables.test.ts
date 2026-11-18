import { VariableValueType } from '@codifycli/schemas';
import { describe, expect, it } from 'vitest';

import { VariableError } from '../common/errors.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { TemplateConfig } from '../entities/template-config.js';
import { VariableConfig } from '../entities/variable-config.js';
import { ConditionValues, conditionReferences, evaluateCondition } from './condition.js';
import { findReferences, substitute } from './substitution.js';
import { VariablePromptRequest, VariableResolver } from './variable-resolver.js';
import { coerceVariableValue } from './variable-values.js';

const variable = (config: Record<string, unknown>) => new VariableConfig({ type: 'variable', ...config } as never);
const resource = (config: Record<string, unknown>) => new ResourceConfig({ type: 'npm', ...config } as never);
const template = (config: Record<string, unknown>) => new TemplateConfig({ type: 'template', ...config } as never);

/** A prompter that answers from a map (by name) and records the requests */
function answers(values: Record<string, unknown>) {
  const requests: VariablePromptRequest[] = [];
  const prompter = async (request: VariablePromptRequest) => {
    requests.push(request);
    return values[request.name];
  };

  return { prompter, requests, asked: () => requests.map((r) => r.name) };
}

const scope = { labels: [], location: 'codify.jsonc' };

describe('substitution', () => {
  it('finds references (not escaped ones)', () => {
    expect([...findReferences({
      a: '${{ projectName }}',
      b: ['~/${{dir}}/x', { c: '${{ port }} and ${{ dir }}' }],
      d: '$${{ escaped }}',
      e: 3,
    })]).toEqual(['projectName', 'dir', 'port']);
  })

  it('keeps the type of exact references and interpolates the rest', () => {
    const values: Record<string, unknown> = { port: 3000, useTs: true, tools: ['docker', 'kubectl'], name: 'site' };
    const lookup = (n: string) => values[n];

    expect(substitute('${{ port }}', lookup)).toBe(3000);
    expect(substitute(' ${{ useTs }} ', lookup)).toBe(true);
    expect(substitute('${{ tools }}', lookup)).toEqual(['docker', 'kubectl']);
    expect(substitute('~/projects/${{ name }}:${{ port }}', lookup)).toBe('~/projects/site:3000');
    expect(substitute('${{ tools }} installed', lookup)).toBe('docker,kubectl installed');
    expect(substitute({ a: ['${{ name }}', 1], b: { c: '${{ port }}' } }, lookup)).toEqual({ a: ['site', 1], b: { c: 3000 } });
  })

  it('unescapes escaped references', () => {
    expect(substitute('run: echo $${{ secrets.TOKEN }}', () => { throw new Error('not called') })).toBe('run: echo $${{ secrets.TOKEN }}');
    expect(substitute('$${{ name }} is ${{ name }}', () => 'site')).toBe('${{ name }} is site');
  })
})

describe('conditions', () => {
  const values: ConditionValues = new Map<string, { value: never; multi: boolean }>([
    ['siteType', { value: 'blog' as never, multi: false }],
    ['port', { value: 3000 as never, multi: false }],
    ['useTs', { value: true as never, multi: false }],
    ['tools', { value: ['docker', 'kubectl'] as never, multi: true }],
    ['notAsked', { value: undefined as never, multi: false }],
  ]);

  it('matches values, lists and not', () => {
    expect(evaluateCondition(undefined, values)).toBe(true);
    expect(evaluateCondition({ siteType: 'blog' }, values)).toBe(true);
    expect(evaluateCondition({ siteType: 'portfolio' }, values)).toBe(false);
    expect(evaluateCondition({ siteType: ['portfolio', 'blog'] }, values)).toBe(true);
    expect(evaluateCondition({ siteType: { not: 'blog' } }, values)).toBe(false);
    expect(evaluateCondition({ siteType: { not: ['portfolio', 'landing'] } }, values)).toBe(true);
    expect(evaluateCondition({ port: 3000, useTs: true }, values)).toBe(true);
    expect(evaluateCondition({ port: 3000, useTs: false }, values)).toBe(false);
  })

  it('multiEnum variables match if they include the value', () => {
    expect(evaluateCondition({ tools: 'docker' }, values)).toBe(true);
    expect(evaluateCondition({ tools: 'podman' }, values)).toBe(false);
    expect(evaluateCondition({ tools: ['podman', 'kubectl'] }, values)).toBe(true);
    expect(evaluateCondition({ tools: { not: 'docker' } }, values)).toBe(false);
  })

  it('supports alternatives with any', () => {
    expect(evaluateCondition({ any: [{ siteType: 'portfolio' }, { useTs: true }] }, values)).toBe(true);
    expect(evaluateCondition({ any: [{ siteType: 'portfolio' }, { useTs: false }] }, values)).toBe(false);
    expect(evaluateCondition({ port: 1, any: [{ useTs: true }] }, values)).toBe(false);
  })

  it('never matches variables without a value', () => {
    expect(evaluateCondition({ notAsked: 'x' }, values)).toBe(false);
    expect(evaluateCondition({ notAsked: { not: 'x' } }, values)).toBe(false);
    expect(evaluateCondition({ unknown: 'x' }, values)).toBe(false);
  })

  it('lists the referenced variables', () => {
    expect(conditionReferences({ a: 1, any: [{ b: 2 }, { a: 3, c: 4 }] })).toEqual(['a', 'b', 'c']);
  })
})

describe('coerceVariableValue', () => {
  it('converts and validates each type', () => {
    expect(coerceVariableValue(variable({ name: 'a' }), 'site')).toBe('site');
    expect(() => coerceVariableValue(variable({ name: 'a' }), '')).toThrow('A value is required');

    const number = variable({ name: 'a', valueType: VariableValueType.NUMBER });
    expect(coerceVariableValue(number, '3000')).toBe(3000);
    expect(coerceVariableValue(number, 1.5)).toBe(1.5);
    expect(() => coerceVariableValue(number, 'abc')).toThrow('not a number');
    expect(() => coerceVariableValue(number, '')).toThrow('not a number');

    const boolean = variable({ name: 'a', valueType: VariableValueType.BOOLEAN });
    expect(coerceVariableValue(boolean, 'yes')).toBe(true);
    expect(coerceVariableValue(boolean, 'False')).toBe(false);
    expect(coerceVariableValue(boolean, true)).toBe(true);
    expect(() => coerceVariableValue(boolean, 'maybe')).toThrow('not a boolean');

    const enumVariable = variable({ name: 'a', valueType: VariableValueType.ENUM, options: ['blog', 'portfolio'] });
    expect(coerceVariableValue(enumVariable, 'blog')).toBe('blog');
    expect(() => coerceVariableValue(enumVariable, 'shop')).toThrow('not one of the options: blog, portfolio');

    const multi = variable({ name: 'a', valueType: VariableValueType.MULTI_ENUM, options: ['docker', 'kubectl'] });
    expect(coerceVariableValue(multi, 'docker, kubectl,docker')).toEqual(['docker', 'kubectl']);
    expect(coerceVariableValue(multi, ['kubectl'])).toEqual(['kubectl']);
    expect(coerceVariableValue(multi, [])).toEqual([]);
    expect(() => coerceVariableValue(multi, 'podman')).toThrow('"podman" is not one of the options');
  })
})

describe('VariableResolver', () => {
  it('asks for the variables in declaration order and replaces the references', async () => {
    const { prompter, requests, asked } = answers({ projectName: 'site', port: '8080' });
    const npm = resource({ globalInstall: ['${{ projectName }}'], port: '${{ port }}' });

    const result = await new VariableResolver(prompter).resolveScope([
      variable({ name: 'projectName', description: 'The name of the project' }),
      npm,
      variable({ name: 'port', valueType: 'number', default: 3000 }),
    ], scope);

    expect(asked()).toEqual(['projectName', 'port']);
    expect(requests[0]).toMatchObject({ name: 'projectName', scope: [], description: 'The name of the project', implicit: false });
    expect(requests[1]).toMatchObject({ valueType: 'number', default: 3000 });
    expect(result.declarations).toEqual([npm]);
    expect(npm.parameters).toEqual({ globalInstall: ['site'], port: 8080 });
    expect(npm.raw.port).toBe(8080);
  })

  it('uses the default when there is no answer', async () => {
    const { prompter } = answers({});
    const npm = resource({ port: '${{ port }}', api: '${{ apiName }}' });
    await new VariableResolver(prompter).resolveScope([
      variable({ name: 'projectName', default: 'site' }),
      variable({ name: 'apiName', default: '${{ projectName }}-api' }),
      variable({ name: 'port', valueType: 'number', default: 3000 }),
      npm,
    ], scope);

    expect(npm.parameters).toEqual({ port: 3000, api: 'site-api' });
  })

  it('asks again until the answer is valid', async () => {
    const given = ['abc', '', '42'];
    const requests: VariablePromptRequest[] = [];
    const npm = resource({ port: '${{ port }}' });

    await new VariableResolver(async (request) => {
      requests.push(request);
      return given.shift();
    }).resolveScope([variable({ name: 'port', valueType: 'number' }), npm], scope);

    expect(requests.map((r) => r.error)).toEqual([undefined, '"abc" is not a number', '"" is not a number']);
    expect(npm.parameters.port).toBe(42);
  })

  it('orders variables by their dependencies and skips variables whose when does not match', async () => {
    const { prompter, asked } = answers({ siteType: 'blog', cssFramework: 'tailwind', blogEngine: 'astro' });

    await new VariableResolver(prompter).resolveScope([
      variable({ name: 'cssFramework', valueType: 'enum', options: ['tailwind'], when: { siteType: { not: 'blog' } } }),
      variable({ name: 'blogEngine', valueType: 'enum', options: ['astro'], when: { siteType: 'blog' } }),
      variable({ name: 'siteType', valueType: 'enum', options: ['blog', 'portfolio'] }),
    ], scope);

    expect(asked()).toEqual(['siteType', 'blogEngine']);
  })

  it('removes resources and templates whose when does not match', async () => {
    const { prompter } = answers({ siteType: 'blog', tools: ['docker'] });
    const blog = resource({ name: 'blog', when: { siteType: 'blog' } });
    const portfolio = resource({ name: 'portfolio', when: { siteType: 'portfolio' } });
    const docker = template({ source: 'docker', when: { tools: 'docker' } });
    const k8s = template({ source: 'k8s', name: 'k8s', when: { tools: 'kubectl' } });

    const result = await new VariableResolver(prompter).resolveScope([
      variable({ name: 'siteType', valueType: 'enum', options: ['blog', 'portfolio'] }),
      variable({ name: 'tools', valueType: 'multiEnum', options: ['docker', 'kubectl'] }),
      blog, portfolio, docker, k8s,
    ], scope);

    expect(result.declarations).toEqual([blog, docker]);
    expect(result.removedResourceIds).toEqual(['npm.portfolio']);
    expect(result.removedTemplateIds).toEqual(['template.k8s']);
  })

  it('asks for referenced variables that are not declared as text and reports them', async () => {
    const { prompter, requests } = answers({ token: 'abc' });
    const npm = resource({ token: '${{ token }}' });
    const skipped = resource({ name: 'x', other: '${{ other }}', when: { useOther: true } });

    const result = await new VariableResolver(prompter).resolveScope([
      variable({ name: 'useOther', valueType: 'boolean', default: false }),
      npm,
      skipped,
    ], scope);

    // Variables of resources that are removed are not asked
    expect(requests.map((r) => [r.name, r.implicit])).toEqual([['useOther', false], ['token', true]]);
    expect(result.implicitVariables).toEqual(['token']);
    expect(npm.parameters.token).toBe('abc');
  })

  it('uses values passed by the template and preset values instead of asking', async () => {
    const { prompter, asked } = answers({ port: '1' });
    const npm = resource({ a: '${{ projectName }}', b: '${{ port }}', c: '${{ token }}' });

    const resolver = new VariableResolver(prompter, [
      { scope: ['astro'], name: 'token', value: 'from-flag' },
      { scope: ['astro'], name: 'projectName', value: 'ignored: passed by the template wins' },
      { scope: [], name: 'token', value: 'other scope' },
    ]);
    await resolver.resolveScope([
      variable({ name: 'projectName' }),
      variable({ name: 'port', valueType: 'number' }),
      npm,
    ], { labels: ['astro'], location: 'template astro', passed: { projectName: 'site' } });

    expect(asked()).toEqual(['port']);
    expect(npm.parameters).toEqual({ a: 'site', b: 1, c: 'from-flag' });
    expect(resolver.resolved).toEqual([
      { scope: ['astro'], name: 'projectName', value: 'site' },
      { scope: ['astro'], name: 'port', value: 1 },
      { scope: ['astro'], name: 'token', value: 'from-flag' },
    ]);
  })

  it('replaces the references in the variables passed to templates', async () => {
    const { prompter } = answers({ projectName: 'site' });
    const astro = template({ source: '@codify/astro', variables: { projectName: '${{ projectName }}', port: 3000 } });

    await new VariableResolver(prompter).resolveScope([variable({ name: 'projectName' }), astro], scope);
    expect(astro.resolvedVariables).toEqual({ projectName: 'site', port: 3000 });
  })

  it('tracks the parameters that come from sensitive variables', async () => {
    const { prompter, requests } = answers({ token: 'secret' });
    const npm = resource({ auth: 'Bearer ${{ token }}', other: 'x' });

    await new VariableResolver(prompter).resolveScope([variable({ name: 'token', sensitive: true }), npm], scope);
    expect(requests[0].sensitive).toBe(true);
    expect([...npm.sensitiveParameterKeys]).toEqual(['auth']);
  })

  it('rejects invalid declarations and references', async () => {
    const resolve = (declarations: unknown[], passed?: Record<string, unknown>) =>
      new VariableResolver(async () => 'x').resolveScope(declarations as never, { ...scope, passed });

    await expect(resolve([variable({ name: 'a' }), variable({ name: 'a' })])).rejects.toThrow('declared more than once');
    await expect(resolve([resource({ when: { typo: 'x' } })])).rejects.toThrow('Resource "npm" has a when condition on "typo", which is not declared');
    await expect(resolve([template({ source: 't', when: { any: [{ typo: 1 }] } })])).rejects.toThrow('Template "t" has a when condition on "typo"');
    await expect(resolve([variable({ name: 'a', when: { b: 1 } })])).rejects.toThrow('Variable "a" has a when condition on "b"');
    await expect(resolve([variable({ name: 'a', default: '${{ a }}' })])).rejects.toThrow('references itself');
    await expect(resolve([
      variable({ name: 'a', default: '${{ b }}' }),
      variable({ name: 'b', when: { a: 'x' } }),
    ])).rejects.toThrow('cycle');
    await expect(resolve([variable({ name: 'a' })], { a: 'x', b: 'y' })).rejects.toThrow('The template has no variable "b"');
    await expect(resolve([variable({ name: 'n', valueType: 'number', default: 'abc' }), resource({ p: '${{ n }}' })]))
      .rejects.toThrow('Invalid default for the variable "n"');
    await expect(resolve([variable({ name: 'n', valueType: 'number' })], { n: 'abc' }))
      .rejects.toThrow('Invalid value for the variable "n": "abc" is not a number');

    await expect(resolve([resource({ name: 'r', p: '${{ x }}' }), resource({ p: '${{ y }}' })], { x: 1, y: 2 })).resolves.toBeDefined();
  })

  it('fails if a resource uses a variable that has no value', async () => {
    const declarations = [
      variable({ name: 'useTs', valueType: 'boolean', default: false }),
      variable({ name: 'tsVersion', when: { useTs: true } }),
      resource({ version: '${{ tsVersion }}' }),
    ];

    const error = await new VariableResolver(async () => undefined).resolveScope(declarations, scope).catch((e) => e);
    expect(error).toBeInstanceOf(VariableError);
    expect(error.message).toContain('Resource "npm" uses ${{ tsVersion }} but the variable has no value');
  })

  it('fails without a prompter when a value is needed', async () => {
    await expect(new VariableResolver().resolveScope([variable({ name: 'a' }), resource({ p: '${{ a }}' })], scope))
      .rejects.toThrow('The variable "a" needs a value');
  })

  it('parses --var flags', () => {
    expect(VariableResolver.parseVarFlags(['name=site', 'astro.port=3000', 'a=b=c'])).toEqual([
      { scope: [], name: 'name', value: 'site' },
      { scope: ['astro'], name: 'port', value: '3000' },
      { scope: [], name: 'a', value: 'b=c' },
    ]);
    expect(() => VariableResolver.parseVarFlags(['novalue'])).toThrow('Invalid --var');
  })
})
