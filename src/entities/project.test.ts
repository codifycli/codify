import { describe, expect, it } from 'vitest';
import { Project } from './project.js';
import { ResourceConfig } from './resource-config.js';
import { InMemoryFile } from '../parser/entities';

describe('Project Unit Tests', () => {
  it('Can add unique names for duplicate resources', async () => {
    // const parser = Parser.supportedParsers['json']
    //
    // const resourceConfigs = await parser.parse(new InMemoryFile({
    //   fileName: 'test',
    //   fileType: 'json',
    //   contents: JSON.stringify([
    //     { type: 'git-clone', remote: 'git@git1' },
    //     { type: 'git-clone', remote: 'git@git1' },
    //     { type: 'git-clone', remote: 'git@git2' },
    //     { type: 'other' }
    //   ])
    // }))
    //
    // const project = new Project(null, resourceConfigs as ResourceConfig[])
    //
    // expect(project.resourceConfigs[0].id).to.eq('git-clone.0')
    // expect(project.resourceConfigs[1].id).to.eq('git-clone.1')
    // expect(project.resourceConfigs[2].id).to.eq('git-clone.2')
    // expect(project.resourceConfigs[3].id).to.eq('other')
  })

})
