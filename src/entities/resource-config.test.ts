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

  it ('detects if two resource configs represent the same thing on the system (different types)', () => {
    const resource1 = new ResourceConfig({
      type: 'type1',
    })
    const resource2 = new ResourceConfig({
      type: 'type2',
    })
    expect(resource1.isSameOnSystem(resource2, false)).to.be.false;

    const resource3 = new ResourceConfig({
      type: 'type1',
    })
    const resource4 = new ResourceConfig({
      type: 'type1',
    })
    expect(resource3.isSameOnSystem(resource4, false)).to.be.true;
  })


  it ('detects if two resource configs represent the same thing on the system (different names)', () => {
    // Fails
    const resource1 = new ResourceConfig({
      type: 'type1',
      name: 'name1',
    })
    const resource2 = new ResourceConfig({
      type: 'type1',
      name: 'name2'
    })
    expect(resource1.isSameOnSystem(resource2)).to.be.false;

    // Passes
    const resource3 = new ResourceConfig({
      type: 'type1',
      name: 'name1',
    })
    const resource4 = new ResourceConfig({
      type: 'type1',
      name: 'name1'
    })
    expect(resource3.isSameOnSystem(resource4, false)).to.be.true;
  })

  it ('detects if two resource configs represent the same thing on the system (different required parameters)', () => {
    // Passes
    const resourceInfo = ResourceInfo.fromResponseData({
      type: 'type1',
      schema: {
        type: 'object',
        required: ['param1', 'param2'],
        properties: {
          param1: {},
          param2: {},
          param3: {}
        }
      }
    });

    const resource1 = new ResourceConfig({
      type: 'type1',
      param2: 'b',
      name: 'name1',
      param1: 'a',
      param3: 'c'
    })
    resource1.attachResourceInfo(resourceInfo)

    const resource2 = new ResourceConfig({
      param3: 'different',
      type: 'type1',
      name: 'name1',
      param1: 'a',
      param2: 'b',
    })
    resource2.attachResourceInfo(resourceInfo)

    expect(resource1.isSameOnSystem(resource2)).to.be.true;

    // Fails
    const resource3 = new ResourceConfig({
      type: 'type1',
      name: 'name1',
      param1: 'a',
      param2: 'b',
      param3: 'c'
    })
    resource3.attachResourceInfo(resourceInfo)

    const resource4 = new ResourceConfig({
      type: 'type1',
      name: 'name1',
      param1: 'a',
      param2: 'different',
      param3: 'different'
    })
    resource4.attachResourceInfo(resourceInfo)

    expect(resource3.isSameOnSystem(resource4)).to.be.false;
  })
});
