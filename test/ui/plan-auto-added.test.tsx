import { ParameterOperation, PlanResponseData, ResourceOperation } from '@codifycli/schemas';
import { Console } from 'node:console';
import { stripVTControlCharacters } from 'node:util';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Plan, ResourcePlan } from '../../src/entities/plan.js';
import { Project } from '../../src/entities/project.js';
import { ResourceConfig } from '../../src/entities/resource-config.js';
import { PlanComponent } from '../../src/ui/components/plan/plan.js';
import { prettyFormatPlan } from '../../src/ui/plan-pretty-printer.js';
import { cleanup, render } from '../utils/helpers/ink-testing-library.js';

if (!console.Console) {
  // @ts-expect-error - Polyfilling console.Console for test environment (required by patch-console/Ink)
  console.Console = Console;
}

function resourcePlan(resourceType: string, parameters: PlanResponseData['parameters'] = []): ResourcePlan {
  return new ResourcePlan({
    planId: resourceType, resourceType, operation: ResourceOperation.CREATE, isStateful: false, parameters,
  });
}

/** cursor and git-repository declared, homebrew and xcode-tools added because they require them */
export function autoAddedPlan(): Plan {
  const cursor = new ResourceConfig({ type: 'cursor' });
  const repo = new ResourceConfig({ type: 'git-repository', repository: 'git@github.com:codifycli/codify.git' });
  const homebrew = new ResourceConfig({ type: 'homebrew' });
  homebrew.requiredBy = ['cursor'];
  const xcodeTools = new ResourceConfig({ type: 'xcode-tools' });
  xcodeTools.requiredBy = ['homebrew', 'git-repository'];

  const project = new Project(null, [xcodeTools, homebrew, cursor, repo], ['/Users/me/codify.jsonc']);
  return new Plan([
    resourcePlan('xcode-tools'),
    resourcePlan('homebrew'),
    resourcePlan('cursor', [{ name: 'directory', operation: ParameterOperation.ADD, previousValue: null, newValue: '/Applications' }]),
    resourcePlan('git-repository', [{ name: 'repository', operation: ParameterOperation.ADD, previousValue: null, newValue: 'git@github.com:codifycli/codify.git' }]),
  ], project);
}

describe('Plan: auto-added resources', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows a badge and the resources that required it', () => {
    const { lastFrame } = render(<PlanComponent plan={autoAddedPlan()} />);
    const lines = stripVTControlCharacters(lastFrame()!).split('\n');

    expect(lines.find((l) => l.includes('xcode-tools will be created'))).toContain('✦ AUTO-ADDED');
    expect(lines.find((l) => l.includes('homebrew will be created'))).toContain('✦ AUTO-ADDED');
    expect(lines.find((l) => l.includes('cursor will be created'))).not.toContain('AUTO-ADDED');
    expect(lines.some((l) => l.includes('↳ required by homebrew, git-repository'))).toBe(true);
    expect(lines.some((l) => l.includes('↳ required by cursor'))).toBe(true);
    expect(lines.some((l) => l.includes('Prerequisites added automatically'))).toBe(true);
  });

  it('shows no hint when nothing was added', () => {
    const project = new Project(null, [new ResourceConfig({ type: 'alias' })], ['/Users/me/codify.jsonc']);
    const { lastFrame } = render(<PlanComponent plan={new Plan([resourcePlan('alias')], project)} />);

    expect(lastFrame()).not.toContain('AUTO-ADDED');
    expect(lastFrame()).not.toContain('Prerequisites added automatically');
  });

  it('shows the badge in plain output', () => {
    const output = stripVTControlCharacters(prettyFormatPlan(autoAddedPlan()));

    expect(output).toContain('xcode-tools will be created  ✦ AUTO-ADDED ');
    expect(output).toContain('↳ required by homebrew, git-repository');
    expect(output).toContain('Prerequisites added automatically');
  });
});
