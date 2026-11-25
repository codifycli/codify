import { NoticeSchema, ProjectSchema, TemplateSchema, VariableSchema } from '@codifycli/schemas';

type JsonSchema = Record<string, unknown>;

/** An example shown on the resource page of the resource library (same shape as ExampleConfig in plugin-core) */
export type CoreExampleConfig = {
  title: string;
  description: string;
  configs: Array<Record<string, unknown>>;
};

/**
 * A core config block: handled by the CLI itself and never sent to a plugin. Uploaded to the resource library like the
 * resources of the default plugin so the dashboard editor and the agent can find, validate and complete them.
 */
export type CoreResource = {
  type: string;
  schema: JsonSchema;
  allowMultiple: boolean;
  defaultConfig: Record<string, unknown>;
  exampleConfigs: { example1: CoreExampleConfig; example2?: CoreExampleConfig };
};

export const CORE_RESOURCES: CoreResource[] = [
  {
    type: 'project',
    schema: ProjectSchema,
    allowMultiple: false,
    defaultConfig: {},
    exampleConfigs: {
      example1: {
        title: 'Project with a description',
        description: 'Describes what the config sets up and the minimum Codify version it needs.',
        configs: [
          { type: 'project', description: 'My React development machine', version: '1.3.0' },
          { type: 'template', source: '@codify/react-essentials' },
        ],
      },
    },
  },
  {
    type: 'template',
    schema: TemplateSchema,
    allowMultiple: true,
    defaultConfig: { source: '<Replace me here!>' },
    exampleConfigs: {
      example1: {
        title: 'Include a template',
        description: 'Adds every resource of a published template to the config, in place, without copying them.',
        configs: [
          { type: 'template', source: '@codify/react-essentials' },
        ],
      },
      example2: {
        title: 'Template with variables and conditions',
        description: 'Passes values to the variables of a template and only includes another template on macOS when a variable matches.',
        configs: [
          { type: 'variable', name: 'needsNode', valueType: 'boolean', label: 'Do you also want Node.js?', default: true },
          { type: 'template', name: 'website', source: '@codify/basic-website', variables: { siteType: 'blog', projectDirectory: '~/projects/blog' } },
          { type: 'template', source: '@codify/nodejs', os: ['macOS'], when: { needsNode: true } },
        ],
      },
    },
  },
  {
    type: 'variable',
    schema: VariableSchema,
    allowMultiple: true,
    defaultConfig: { name: '<Replace me here!>', valueType: 'text' },
    exampleConfigs: {
      example1: {
        title: 'Text variable used in a resource',
        description: 'Asks where to clone a project when the config runs and uses the answer as a parameter.',
        configs: [
          { type: 'variable', name: 'projectDirectory', label: 'Where should the project be cloned?', default: '~/projects/my-app' },
          { type: 'git-repository', repository: 'https://github.com/satnaing/astro-paper.git', directory: '${{ projectDirectory }}' },
        ],
      },
      example2: {
        title: 'Choice that picks the resources',
        description: 'Asks which tools to install and only includes the resources whose when condition matches the answer.',
        configs: [
          {
            type: 'variable',
            name: 'packageManager',
            valueType: 'enum',
            label: 'Which package manager do you use?',
            options: ['npm', 'pnpm'],
            default: 'pnpm',
          },
          { type: 'nvm', nodeVersions: ['24'], global: '24' },
          { type: 'pnpm', when: { packageManager: 'pnpm' }, dependsOn: ['nvm'] },
        ],
      },
    },
  },
  {
    type: 'notice',
    schema: NoticeSchema,
    allowMultiple: true,
    defaultConfig: { message: '<Replace me here!>' },
    exampleConfigs: {
      example1: {
        title: 'Getting started steps',
        description: 'Shows the user how to start their project once everything is installed.',
        configs: [
          { type: 'variable', name: 'projectDirectory', label: 'Where should the project be cloned?', default: '~/projects/blog' },
          { type: 'template', name: 'website', source: '@codify/basic-website', variables: { siteType: 'blog', projectDirectory: '${{ projectDirectory }}' } },
          {
            type: 'notice',
            title: 'Start your blog',
            level: 'success',
            message: '1. `cd ${{ projectDirectory }}`\n2. Run `pnpm dev`\n3. Open http://localhost:4321',
            dependsOn: ['template.website'],
          },
        ],
      },
      example2: {
        title: 'Warning before applying',
        description: 'Warns the user with the plan, before they confirm, and reminds them on every run.',
        configs: [
          { type: 'nvm', nodeVersions: ['24'], global: '24' },
          {
            type: 'notice',
            stage: 'plan',
            level: 'warning',
            title: 'Node versions are managed by nvm',
            message: 'Uninstall any Node.js installed with Homebrew or the official installer first, or `node` may not be the version nvm selects.',
          },
          { type: 'notice', show: 'always', message: 'Run `nvm use` in a project to switch to the Node version in its `.nvmrc`.' },
        ],
      },
    },
  },
];

/** The schema as it is stored in the resource library: the block of the schemastore file (no $schema, $id or title) */
export function toRegistrySchema(schema: JsonSchema): JsonSchema {
  const { $id: _id, $schema: _schema, title: _title, ...rest } = structuredClone(schema);
  return rest;
}
