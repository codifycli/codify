import { ResourceOs } from '@codifycli/schemas';
import { describe, expect, it, vi } from 'vitest';
import { OsUtils } from '../utils/os-utils.js';
import { Project } from './project.js';
import { ResourceConfig } from './resource-config.js';

function makeProject(...configs: ResourceConfig[]): Project {
  return new Project(null, configs, []);
}

describe('dependsOn resolution', () => {
  it('resolves by type — all resources of that type become dependencies', () => {
    const a = new ResourceConfig({ type: 'npm', name: 'lodash' });
    const b = new ResourceConfig({ type: 'npm', name: 'react' });
    const c = new ResourceConfig({ type: 'node', dependsOn: ['npm'] });

    const project = makeProject(a, b, c);
    project.resolveDependenciesAndCalculateEvalOrder();

    expect(c.dependencyIds).toContain('npm.lodash');
    expect(c.dependencyIds).toContain('npm.react');
    expect(project.evaluationOrder).toContain('npm.lodash');
    expect(project.evaluationOrder).toContain('npm.react');
    expect(project.evaluationOrder!.indexOf('node')).toBeGreaterThan(project.evaluationOrder!.indexOf('npm.lodash'));
    expect(project.evaluationOrder!.indexOf('node')).toBeGreaterThan(project.evaluationOrder!.indexOf('npm.react'));
  });

  it('resolves by fully qualified id (type.name) — exactly one resource', () => {
    const a = new ResourceConfig({ type: 'git-clone', name: 'my-repo' });
    const b = new ResourceConfig({ type: 'git-clone', name: 'other-repo' });
    const c = new ResourceConfig({ type: 'node', dependsOn: ['git-clone.my-repo'] });

    const project = makeProject(a, b, c);
    project.resolveDependenciesAndCalculateEvalOrder();

    expect(c.dependencyIds).toEqual(['git-clone.my-repo']);
    expect(c.dependencyIds).not.toContain('git-clone.other-repo');
  });

  it('throws when a fully qualified id is not found', () => {
    const a = new ResourceConfig({ type: 'git-clone', name: 'my-repo' });
    const c = new ResourceConfig({ type: 'node', dependsOn: ['git-clone.missing'] });

    const project = makeProject(a, c);
    expect(() => project.resolveDependenciesAndCalculateEvalOrder()).toThrow(/git-clone\.missing/);
  });

  it('resolves by name alone when unambiguous', () => {
    const a = new ResourceConfig({ type: 'git-clone', name: 'my-repo' });
    const c = new ResourceConfig({ type: 'node', dependsOn: ['my-repo'] });

    const project = makeProject(a, c);
    project.resolveDependenciesAndCalculateEvalOrder();

    expect(c.dependencyIds).toEqual(['git-clone.my-repo']);
  });

  it('resolves all resources sharing the same name (across different types)', () => {
    const a = new ResourceConfig({ type: 'git-clone', name: 'shared' });
    const b = new ResourceConfig({ type: 'npm', name: 'shared' });
    const c = new ResourceConfig({ type: 'node', dependsOn: ['shared'] });

    const project = makeProject(a, b, c);
    project.resolveDependenciesAndCalculateEvalOrder();

    expect(c.dependencyIds).toContain('git-clone.shared');
    expect(c.dependencyIds).toContain('npm.shared');
  });

  it('throws when the reference matches nothing', () => {
    const a = new ResourceConfig({ type: 'npm' });
    const c = new ResourceConfig({ type: 'node', dependsOn: ['nonexistent'] });

    const project = makeProject(a, c);
    expect(() => project.resolveDependenciesAndCalculateEvalOrder()).toThrow(/nonexistent/);
  });
});

describe('dependsOn resolution — OS filtering', () => {
  it('drops dependsOn entries for resources removed by OS filter (fully qualified id)', () => {
    vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.MACOS);
    const apt = new ResourceConfig({ type: 'apt', name: 'linux-packages', os: [ResourceOs.LINUX] });
    const docker = new ResourceConfig({ type: 'docker', dependsOn: ['apt.linux-packages'] });

    const project = makeProject(apt, docker);
    project.removeResourcesUsingOsFilter(); // removes apt on macOS
    project.resolveDependenciesAndCalculateEvalOrder();

    expect(docker.dependencyIds).not.toContain('apt.linux-packages');
  });

  it('drops dependsOn entries for resources removed by OS filter (type reference)', () => {
    vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.MACOS);
    const apt = new ResourceConfig({ type: 'apt', os: [ResourceOs.LINUX] });
    const docker = new ResourceConfig({ type: 'docker', dependsOn: ['apt'] });

    const project = makeProject(apt, docker);
    project.removeResourcesUsingOsFilter();
    project.resolveDependenciesAndCalculateEvalOrder();

    expect(docker.dependencyIds).not.toContain('apt');
  });

  it('keeps dependsOn entry when only some resources of a type are filtered', () => {
    vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.MACOS);
    const aptLinux = new ResourceConfig({ type: 'apt', name: 'linux', os: [ResourceOs.LINUX] });
    const aptAll = new ResourceConfig({ type: 'apt', name: 'all' }); // no OS filter
    const docker = new ResourceConfig({ type: 'docker', dependsOn: ['apt'] });

    const project = makeProject(aptLinux, aptAll, docker);
    project.removeResourcesUsingOsFilter(); // removes apt.linux but keeps apt.all
    project.resolveDependenciesAndCalculateEvalOrder();

    expect(docker.dependencyIds).toContain('apt.all');
  });

  it('reproduces the reported cross-OS config scenario without throwing', () => {
    vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.MACOS);
    const homebrew = new ResourceConfig({ type: 'homebrew', name: 'macos-packages', os: [ResourceOs.MACOS] });
    const apt = new ResourceConfig({ type: 'apt', name: 'linux-packages', os: [ResourceOs.LINUX] });
    const docker = new ResourceConfig({ type: 'docker', dependsOn: ['homebrew.macos-packages', 'apt.linux-packages'] });
    const nvm = new ResourceConfig({ type: 'nvm', dependsOn: ['homebrew.macos-packages', 'apt.linux-packages'] });

    const project = makeProject(homebrew, apt, docker, nvm);
    project.removeResourcesUsingOsFilter(); // on macOS: removes apt, keeps homebrew

    expect(() => project.resolveDependenciesAndCalculateEvalOrder()).not.toThrow();
  });
});
