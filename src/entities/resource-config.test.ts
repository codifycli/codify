//import { ProjectConfig } from './project.js';
import { describe, expect, it } from 'vitest';
import { ResourceConfig } from './resource-config';
import { ResourceInfo } from './resource-info';

describe('Resource config unit tests', () => {
  it('parses an empty project', () => {
    expect(new ResourceConfig({
      type: 'anything',
    })).to.not.throw;
  })

  it('requires a project type', () => {
  })

  it('rejects invalid keys', () => {
  })

  it('plugin versions must be semvers', () => {
  })

  it('an optional name must be a string', () => {
  })

  it('plugin versions must be semvers', () => {
  })
});
