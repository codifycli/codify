import z from 'zod';

import { createToolDefinition } from '../utils.js';

/**
 * Mock resource list.
 * In the future, this will fetch from the /v1/registry/resources endpoint
 */
const MOCK_RESOURCES = [
  {
    type: 'nvm',
    name: 'NVM (Node Version Manager)',
    description: 'Install and manage Node versions using nvm.',
    // category: 'JavaScript',
    documentation: 'https://docs.codifycli.com/core-resources/javascript/nvm/'
  },
  {
    type: 'homebrew',
    name: 'Homebrew',
    description: 'Install homebrew and manages formulae, casks and taps.',
    // category: 'Package Management',
    documentation: 'https://docs.codifycli.com/core-resources/homebrew/'
  },
  {
    type: 'file',
    name: 'File',
    description: 'Creates or manages files on the filesystem.',
    // category: 'File System',
    documentation: 'https://docs.codifycli.com/core-resources/file/'
  },
  {
    type: 'alias',
    name: 'Alias',
    description: 'Manages user aliases. It permanently saves the alias by adding it to the shell startup script.',
    // category: 'Shell',
    documentation: 'https://docs.codifycli.com/core-resources/alias/'
  },
  {
    type: 'git-repository',
    name: 'Git Repository',
    description: 'Git clone a repository. Choose either to specify the exact directory to clone into or the parent directory.',
    // category: 'Version Control',
    documentation: 'https://docs.codifycli.com/core-resources/git/git-repository/'
  },
  {
    type: 'docker',
    name: 'Docker',
    description: 'Installs docker.',
    // category: 'Containerization',
    documentation: 'https://docs.codifycli.com/core-resources/docker/'
  }
];

const definition = createToolDefinition({
  name: 'list_resources',
  config: {
    description: 'List all available Codify resource types. This returns a catalog of resources that can be used in Codify configurations, including their types, descriptions, and categories. Use this to discover what resources are available before writing configurations. In the future, this will fetch from the /v1/registry/resources endpoint.',
    inputSchema: z.object({
      search: z.string().optional().describe('Search for resources by name or description')
    }),
    // outputSchema: z.object({
    //   resources: z.array(
    //     z.object({
    //       type: z.string().describe('The resource type identifier used in configurations'),
    //       name: z.string().describe('Human-readable name of the resource'),
    //       description: z.string().optional().describe('Description of what the resource does'),
    //       documentation: z.string().optional().describe('URL to the documentation for this resource')
    //     })
    //   ).describe('Array of available resources'),
    //   totalCount: z.number().describe('Total number of resources returned')
    // })
  },
  async handler(args) {
    // return {
    //   content: [{
    //     type: 'text',
    //     text: 'abc',
    //   }]
    // }

    try {
      // TODO: In the future, fetch from /v1/registry/resources endpoint
      // const response = await fetch('https://api.codifycli.com/v1/registry/resources');
      // const data = await response.json();

      let filteredResources = [...MOCK_RESOURCES];

      // Filter by search term if specified
      if (args.search) {
        const searchLower = args.search.toLowerCase();
        filteredResources = filteredResources.filter(
          resource =>
            resource.type.toLowerCase().includes(searchLower) ||
            resource.name.toLowerCase().includes(searchLower) ||
            resource.description.toLowerCase().includes(searchLower)
        );
      }

      console.error('My response');
      console.error(JSON.stringify({
        resources: filteredResources,
        totalCount: filteredResources.length,
        // categories,
        note: 'This is currently using mock data. In the future, this will fetch from the /v1/registry/resources endpoint.'
      }, null, 2));

      const schema = z.object({
        resources: z.array(
          z.object({
            type: z.string().describe('The resource type identifier used in configurations'),
            name: z.string().describe('Human-readable name of the resource'),
            description: z.string().optional().describe('Description of what the resource does'),
            documentation: z.string().optional().describe('URL to the documentation for this resource')
          })
        ).describe('Array of available resources'),
        totalCount: z.number().describe('Total number of resources returned')
      });

      const parsed = schema.safeParse({
        resources: filteredResources,
        totalCount: filteredResources.length,
      });

      console.error('Parse result', JSON.stringify(parsed, null, 2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              resources: filteredResources,
              totalCount: filteredResources.length,
            })
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              message: 'Failed to list resources',
              error: errorMessage
            }, null, 2)
          }
        ],
        isError: true,
      };
    }
  }
});

export default definition;
