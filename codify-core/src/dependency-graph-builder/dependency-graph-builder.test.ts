// import { expect } from '@oclif/test';
// import { DependencyGraphResolver } from '../utils/dependency-graph-resolver.js';
// import { Resource } from './entities/resource.js';
// import { CompiledProject } from './entities/compiled-project.js';
// import { ProjectConfig } from '../parser/entities/configs/project.js';
//
// describe('Dependency graph tests', () => {
//
//   it('parses and replace resource references', () => {
//     const resource1 = () => new Resource(
//       'homebrew_installation',
//       undefined,
//       new Map([
//         ['directory', '/usr/opt']
//       ]),
//       '',
//     );
//
//     const resource2 = () => new Resource(
//       'homebrew_options',
//       undefined,
//       new Map([
//         ['directory', '${homebrew_installation.directory}']
//       ]),
//       '',
//     );
//
//     const graph = new Map([resource1(), resource2()].map((g) => [g.id, g]));
//     const project = new CompiledProject({ applyableGraph: graph, projectConfig: {} as ProjectConfig });
//
//     expect(() => DependencyGraphResolver.calculateDependencyList(project)).to.not.throw()
//     expect(project.applyableGraph.get('homebrew_installation')).to.deep.eq(resource1())
//     expect(project.applyableGraph.get('homebrew_options')).to.not.deep.eq(resource2())
//     // @ts-ignore
//     expect(project.applyableGraph.get('homebrew_options').parameters.get('directory')).to.eq(graph.get('homebrew_installation')!.parameters.get('directory'));
//   })
//
//   it('validates invalid resources', () => {
//     const resource1 = () => new Resource(
//       'homebrew_installation',
//       undefined,
//       new Map([
//         ['directory', '/usr/opt']
//       ]),
//       '',
//     );
//
//     const resource2 = () => new Resource(
//       'homebrew_options',
//       undefined,
//       new Map([
//         ['directory', '${homebrew_installation_invalid.directory}']
//       ]),
//       '',
//     );
//
//     const graph = new Map([resource1(), resource2()].map((g) => [g.id, g]));
//     const project = new CompiledProject({ applyableGraph: graph, projectConfig: {} as ProjectConfig });
//
//     expect(() => DependencyGraphResolver.calculateDependencyList(project)).to.throw()
//   })
//
//   it('validates invalid parameters', () => {
//     const resource1 = () => new Resource(
//       'homebrew_installation',
//       undefined,
//       new Map([
//         ['directory', '/usr/opt']
//       ]),
//       '',
//     );
//
//     const resource2 = () => new Resource(
//       'homebrew_options',
//       undefined,
//       new Map([
//         ['directory', '${homebrew_installation.directory_invalid}']
//       ]),
//       '',
//     );
//
//     const graph = new Map([resource1(), resource2()].map((g) => [g.id, g]));
//     const project = new CompiledProject({ applyableGraph: graph, projectConfig: {} as ProjectConfig });
//
//     expect(() => DependencyGraphResolver.calculateDependencyList(project)).to.throw()
//   })
//
//   it('handles multiple resource references', () => {
//     const resource1 = () => new Resource(
//       'homebrew_installation',
//       undefined,
//       new Map([
//         ['directory', '/usr/opt']
//       ]),
//       '',
//     );
//
//     const resource2 = () => new Resource(
//       'homebrew_options',
//       undefined,
//       new Map([
//         ['directory', '$\{homebrew_installation.directory} and $\{homebrew_installation.directory}']
//       ]),
//       '',
//     );
//
//     const graph = new Map([resource1(), resource2()].map((g) => [g.id, g]));
//     const project = new CompiledProject({ applyableGraph: graph, projectConfig: {} as ProjectConfig });
//
//     expect(() => DependencyGraphResolver.calculateDependencyList(project)).to.not.throw()
//     expect(project.applyableGraph.get('homebrew_installation')).to.deep.eq(resource1())
//     expect(project.applyableGraph.get('homebrew_options')).to.not.deep.eq(resource2())
//     // @ts-ignore
//     expect(project.applyableGraph.get('homebrew_options').parameters.get('directory')).to.eq(`/usr/opt and /usr/opt`);
//   })
//
//   it('handles named resources', () => {
//     const resource1 = () => new Resource(
//       'homebrew_installation',
//       'first',
//       new Map([
//         ['directory', '/usr/opt']
//       ]),
//       '',
//     );
//
//     const resource2 = () => new Resource(
//       'homebrew_options',
//       undefined,
//       new Map([
//         ['directory', '$\{homebrew_installation.first.directory}']
//       ]),
//       '',
//     );
//
//     const graph = new Map([resource1(), resource2()].map((g) => [g.id, g]));
//     const project = new CompiledProject({ applyableGraph: graph, projectConfig: {} as ProjectConfig });
//
//     expect(() => DependencyGraphResolver.calculateDependencyList(project)).to.not.throw()
//     expect(project.applyableGraph.get('homebrew_installation.first')).to.deep.eq(resource1())
//     expect(project.applyableGraph.get('homebrew_options')).to.not.deep.eq(resource2())
//     // @ts-ignore
//     expect(project.applyableGraph.get('homebrew_options').parameters.get('directory')).to.eq(`/usr/opt`);
//   })
// })
