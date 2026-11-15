import { Plugin as PluginLibrary } from '@codifycli/plugin-core';
import { ResourceDefinition } from '@codifycli/schemas';
import { describe, expect, it } from 'vitest';

import { getMockResources } from '../../test/orchestrator/mocks/get-mock-resources.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { FileType, InMemoryFile } from '../parser/entities.js';
import { CodifyParser } from '../parser/index.js';
import { PluginManager } from '../plugins/plugin-manager.js';
import { TemplateExpander } from './template-expander.js';
import { TemplateResourceMerger } from './template-resource-merger.js';

// Uses the real plugin-core match implementation with the mock resources:
//   - mock: allowMultiple with identifyingParameters ['propA']
//   - xcode-tools: allowMultiple false
function pluginManager(): PluginManager {
  const plugin = PluginLibrary.create('default', getMockResources());
  return {
    async match(resource: ResourceConfig, array: ResourceConfig[]) {
      const { match } = await plugin.match({ resource: resource.toJson(), array: array.map((r) => r.toJson()) });
      return match ? ResourceConfig.fromJson(match) : null;
    }
  } as unknown as PluginManager;
}

const resourceDefinitions = new Map<string, ResourceDefinition>([
  ['mock', { type: 'mock', dependencies: [] }],
  ['xcode-tools', { type: 'xcode-tools', dependencies: [] }],
]);

async function expandAndMerge(configs: unknown[], templates: Record<string, string>) {
  const project = await CodifyParser.parseJson(configs as never);
  await new TemplateExpander({
    async load(template): Promise<InMemoryFile> {
      return { contents: templates[template.source], filePath: `template:${template.source}`, fileType: FileType.JSONC };
    }
  }).expand(project);

  const warnings = await TemplateResourceMerger.merge(project, pluginManager(), resourceDefinitions);
  return { project, warnings };
}

const summary = (project: Project) => project.resourceConfigs.map((r) => ({ id: r.id, ...r.parameters }));

describe('TemplateResourceMerger', () => {
  it('merges a template resource into the matching project resource (identifying parameters equal)', async () => {
    const { project, warnings } = await expandAndMerge([
      { type: 'mock', propA: 'a', propB: 1, array: ['x'] },
      { type: 'template', source: 't1' },
    ], {
      t1: '[{ "type": "mock", "propA": "a", "propB": 2, "array": ["x", "y"], "directory": "/tmp" }]',
    });

    // Arrays are combined, missing values are added and the project value wins for conflicts
    expect(summary(project)).toEqual([{ id: 'mock', propA: 'a', propB: 1, array: ['x', 'y'], directory: '/tmp' }]);
    expect(warnings).toEqual([{ resourceId: 'mock', parameter: 'propB', keptValue: 1, droppedValue: 2 }]);

    const [merged] = project.resourceConfigs;
    expect(merged.origins.map((o) => o.templates.map((t) => t.source))).toEqual([[], ['t1']]);
    expect(merged.isFromTemplatesOnly).toBe(false);
  });

  it('keeps resources with different identifying parameters and names them in declaration order', async () => {
    const { project } = await expandAndMerge([
      { type: 'mock', propA: 'a', propB: 1 },
      { type: 'template', source: 't1' },
    ], {
      t1: '[{ "type": "mock", "propA": "b", "propB": 1 }]',
    });

    expect(summary(project)).toEqual([
      { id: 'mock.0', propA: 'a', propB: 1 },
      { id: 'mock.1', propA: 'b', propB: 1 },
    ]);
  });

  it('merges every resource of a type that does not allow multiples', async () => {
    const { project } = await expandAndMerge([
      { type: 'template', source: 't1' },
      { type: 'xcode-tools', propA: 'mine' },
    ], {
      t1: '[{ "type": "xcode-tools", "propA": "theirs", "propB": 2 }]',
    });

    // The project resource wins (even though it is declared after the template) and keeps its position
    expect(summary(project)).toEqual([{ id: 'xcode-tools', propA: 'mine', propB: 2 }]);
  });

  it('lets the earlier template win when two templates declare the same resource', async () => {
    const { project, warnings } = await expandAndMerge([
      { type: 'template', source: 't1' },
      { type: 'template', source: 't2' },
    ], {
      t1: '[{ "type": "mock", "propA": "a", "propB": 1 }]',
      t2: '[{ "type": "mock", "propA": "a", "propB": 2 }, { "type": "mock", "propA": "c", "propB": 3 }]',
    });

    expect(summary(project)).toEqual([
      { id: 'mock.0', propA: 'a', propB: 1 },
      { id: 'mock.1', propA: 'c', propB: 3 },
    ]);
    expect(warnings).toHaveLength(1);
    expect(project.resourceConfigs[0].origins.map((o) => o.templates[0].source)).toEqual(['t1', 't2']);
  });

  it('keeps the dependsOn of the merged template resource', async () => {
    const { project } = await expandAndMerge([
      { type: 'mock', propA: 'a', propB: 1 },
      { type: 'template', source: 't1' },
      { type: 'xcode-tools' },
    ], {
      t1: '[{ "type": "mock", "propA": "a", "propB": 1, "dependsOn": ["xcode-tools"] }]',
    });

    project.resolveDependenciesAndCalculateEvalOrder();
    expect(project.findSpecific('mock')!.dependsOn).toEqual([]);
    expect(project.findSpecific('mock')!.dependencyIds).toEqual(['xcode-tools']);
  });

  it('throws when an explicitly named template resource collides with a different project resource', async () => {
    await expect(expandAndMerge([
      { type: 'mock', name: 'main', propA: 'a', propB: 1 },
      { type: 'template', source: 't1' },
    ], {
      t1: '[{ "type": "mock", "name": "main", "propA": "b", "propB": 1 }]',
    })).rejects.toThrow(/Duplicate name found for resource: mock.main.*t1/s);
  });

  it('does nothing without templates', async () => {
    const project = await CodifyParser.parseJson([{ type: 'mock', propA: 'a', propB: 1 }] as never);
    expect(await TemplateResourceMerger.merge(project, pluginManager(), resourceDefinitions)).toEqual([]);
  });
});
