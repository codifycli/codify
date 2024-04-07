import { ProjectConfig } from './project-config';
import { describe, expect, it } from 'vitest';

describe('Parser: project entity tests', () => {
  it('parses an empty project', () => {
    expect(new ProjectConfig({
      type: 'project',
    })).to.not.throw;
  })

  it('requires a project type', () => {
    expect(() => new ProjectConfig({})).to.throw;
  })

  it('rejects invalid keys', () => {
    expect(() => new ProjectConfig({
      randomKey: '',
      type: 'project',
    })).to.throw;
  })

  it('plugin versions must be semvers', () => {
    expect(() => new ProjectConfig({
      plugins: {
        plugin1: '4.17.10'
      },
      type: 'project',
    })).to.not.throw;

    expect(() => new ProjectConfig({
      plugins: {
        plugin1: '4'
      },
      type: 'project',
    })).to.not.throw;

    expect(() => new ProjectConfig({
      plugins: {
        plugin1: '^4.0.0'
      },
      type: 'project',
    })).to.not.throw;

    expect(() => new ProjectConfig({
      plugins: {
        plugin1: '.0'
      },
      type: 'project',
    })).to.throw;
  })

  it('an optional name must be a string', () => {
    expect(() => new ProjectConfig({
      name: 1,
      type: 'project',
    })).to.throw;

    expect(() => new ProjectConfig({
      name: 'test-project',
      type: 'project',
    })).to.not.throw;

    expect(() => new ProjectConfig({
      name: '1',
      type: 'project',
    })).to.throw;

    expect(() => new ProjectConfig({
      name: '##ab',
      type: 'project',
    })).to.throw;

    expect(() => new ProjectConfig({
      name: 'abc12',
      type: 'project',
    })).to.not.throw;
  })

  it('plugin versions must be semvers', () => {
    expect(() => new ProjectConfig({
      plugins: {
        plugin1: '4.17.10'
      },
      type: 'project',
    })).to.not.throw;

    expect(() => new ProjectConfig({
      plugins: {
        plugin1: '4'
      },
      type: 'project',
    })).to.not.throw;

    expect(() => new ProjectConfig({
      plugins: {
        plugin1: '^4.0.0'
      },
      type: 'project',
    })).to.not.throw;

    expect(() => new ProjectConfig({
      plugins: {
        plugin1: '.0'
      },
      type: 'project',
    })).to.throw;
  })
});
