import { ParameterOperation, ResourceOperation } from '@codifycli/schemas';
import { describe, expect, it } from 'vitest';

import { Plan, ResourcePlan } from '../../../src/entities/plan.js';
import { Project } from '../../../src/entities/project.js';
import { ResourceConfig } from '../../../src/entities/resource-config.js';
import { PlanOrchestrator } from '../../../src/orchestrators/plan.js';

describe('Plan: variables', () => {
  it('warns about variables that are used but not declared', () => {
    const project = new Project(null, [], []);
    expect(PlanOrchestrator.implicitVariablesWarning(project)).toEqual([]);

    project.implicitVariables = ['token', 'astro.projectName'];
    expect(PlanOrchestrator.implicitVariablesWarning(project)).toEqual([
      '"token", "astro.projectName" are used but not declared. Declare them with a variable block ({ "type": "variable", "name": "..." }) to add a type, a default and a description.',
    ]);
  });

  it('shows the values of sensitive variables as [Sensitive]', () => {
    const resource = new ResourceConfig({ type: 'aws-profile', token: 'secret', region: 'us-east-1' });
    resource.sensitiveParameterKeys.add('token');
    const project = new Project(null, [resource], []);

    const parameter = (name: string, newValue: unknown) => ({ name, newValue, previousValue: null, operation: ParameterOperation.ADD });
    const plan = new Plan([new ResourcePlan({
      planId: '1',
      operation: ResourceOperation.CREATE,
      resourceType: 'aws-profile',
      isStateful: false,
      parameters: [parameter('token', 'secret'), parameter('region', 'us-east-1')],
    } as never)], project);

    PlanOrchestrator.markSensitiveVariables(plan, project);
    expect(plan.resources[0].parameters.map((p) => [p.name, p.isSensitive])).toEqual([['token', true], ['region', undefined]]);
  });
});
