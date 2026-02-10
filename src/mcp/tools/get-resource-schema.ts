import z from 'zod';

import { createToolDefinition } from '../utils.js';

/**
 * Mock resource schemas for different resource types.
 * In the future, this will fetch from /v1/registry/resources/search?q= endpoint
 */
const MOCK_RESOURCE_SCHEMAS: Record<string, {
  type: string;
  description: string;
  schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}> = {
  'nvm': {
    type: 'nvm',
    description: 'Manages Node.js versions using nvm (Node Version Manager)',
    schema: {
      '$schema': 'http://json-schema.org/draft-07/schema',
      '$id': 'https://www.codifycli.com/nvm.json',
      '$comment': 'https://docs.codifycli.com/core-resources/javascript/nvm/',
      'title': 'Nvm resource',
      'description': 'Install and manage Node versions using nvm.',
      'type': 'object',
      'properties': {
        'nodeVersions': {
          'type': 'array',
          'description': 'An array of node versions to install using nvm. Partial matching is supported (20 instead of 20.15.1)',
          'items': {
            'type': 'string'
          }
        },
        'global': {
          'description': 'The global Node version set by nvm.',
          'type': 'string'
        }
      },
      'additionalProperties': false
    }
  },
  'homebrew': {
    type: 'homebrew',
    description: 'Manages packages installed via Homebrew on macOS',
    schema: {
      '$schema': 'http://json-schema.org/draft-07/schema',
      '$id': 'https://www.codifycli.com/homebrew-main.json',
      'title': 'Homebrew plugin main resource',
      '$comment': 'https://docs.codifycli.com/core-resources/homebrew/',
      'description': 'Install homebrew and manages formulae, casks and taps.',
      'type': 'object',
      'properties': {
        'formulae': {
          'type': 'array',
          'items': {
            'type': 'string'
          }
        },
        'casks': {
          'type': 'array',
          'items': {
            'type': 'string'
          }
        },
        'taps': {
          'type': 'array',
          'items': {
            'type': 'string'
          }
        },
        'directory': {
          'type': 'string'
        },
        'skipAlreadyInstalledCasks': {
          'type': 'boolean',
          'description': 'Skips installing an casks which has already been installed externally. This prevents homebrew from conflicting with the existing install. Defaults to true.'
        },
        'onlyPlanUserInstalled': {
          'type': 'boolean',
          'description': 'Only consider packages that the user has explicitly specified in the plan and ignore any dependent packages'
        }
      },
      'additionalProperties': false
    }

  },
  'file': {
    type: 'file',
    description: 'Creates or manages files on the filesystem',
    schema: {
      'type': 'object',
      'properties': {
        'path': {
          'type': 'string',
          'description': 'The location of the file.'
        },
        'contents': {
          'type': 'string',
          'description': 'The contents of the file.'
        },
        'onlyCreate': {
          'type': 'boolean',
          'description': 'Forces the resource to only create the file if it doesn\'t exist but don\'t detect any content changes.'
        }
      },
      'required': [
        'path',
        'contents'
      ],
      'additionalProperties': false,
      '$schema': 'http://json-schema.org/draft-07/schema#'
    }
  },
  'alias': {
    type: 'alias',
    description: 'Creates shell aliases in shell configuration files',
    schema: {
      '$schema': 'http://json-schema.org/draft-07/schema',
      '$id': 'https://www.codifycli.com/alias.json',
      '$comment': 'https://docs.codifycli.com/core-resources/alias/',
      'title': 'Alias resource',
      'description': 'Manages user aliases. It permanently saves the alias by adding it to the shell startup script.',
      'type': 'object',
      'properties': {
        'alias': {
          'type': 'string',
          'pattern': '^[^ \t\n/\\$`=|&;()<>\'"]*$',
          'description': 'The name of the alias'
        },
        'value': {
          'type': 'string',
          'description': 'The alias value'
        }
      },
      'required': ['alias'],
      'additionalProperties': false
    }

  },
  'git-repository': {
    type: 'git-repository',
    description: 'Clones a Git repository to a specified location',
    schema: {
      '$schema': 'http://json-schema.org/draft-07/schema',
      '$id': 'https://www.codifycli.com/git-clone.json',
      '$comment': 'https://docs.codifycli.com/core-resources/git/git-repository/',
      'title': 'Git-clone resource',
      'description': 'Git clone a repository. Choose either to specify the exact directory to clone into or the parent directory (it deduces the folder name using the repository name).',
      'type': 'object',
      'properties': {
        'repository': {
          'type': 'string',
          'description': 'Remote repository to clone repo from.'
        },
        'repositories': {
          'type': 'array',
          'description': 'Remote repositories to clone. This is a convenience property for cloning multiple repositories at once.',
          'items': {
            'type': 'string'
          }
        },
        'parentDirectory': {
          'type': 'string',
          'description': 'Parent directory to clone into. The folder name will use default git semantics which extracts the last part of the clone url. Only one of parentDirectory or directory can be specified'
        },
        'directory': {
          'type': 'string',
          'description': 'Directory to clone contents into. This value is directly passed into git clone. This differs from parent directory in that the last part of the path will be the folder name of the repo'
        },
        'autoVerifySSH': {
          'type': 'boolean',
          'description': 'Automatically verifies the ssh connection for ssh git clones. Defaults to true.'
        }
      },
      'additionalProperties': false,
      'oneOf': [
        { 'required': ['repository', 'directory'] },
        { 'required': ['repositories', 'parentDirectory'] }
      ]
    }

  },
  'docker': {
    type: 'docker',
    description: 'Manages Docker installations',
    schema: {
      '$schema': 'http://json-schema.org/draft-07/schema',
      '$id': 'https://www.codifycli.com/docker.json',
      '$comment': 'https://docs.codifycli.com/core-resources/docker/',
      'title': 'Docker resource',
      'type': 'object',
      'description': 'Installs docker.',
      'properties': {
        'acceptLicense': {
          'type': 'boolean',
          'description': 'Accepts the license agreement. Defaults to true'
        },
        'useCurrentUser': {
          'type': 'boolean',
          'description': 'Use the current user to install docker. Defaults to true'
        }
      },
      'additionalProperties': false
    }
  }
};

const definition = createToolDefinition({
  name: 'get_resource_schema',
  config: {
    description: 'Get the JSON schema for a specific Codify resource type. This schema defines the valid parameters, their types, and constraints for the resource. Use this to understand what parameters are available and required for a given resource type. In the future, this will fetch from the /v1/registry/resources/search?q= endpoint.',
    inputSchema: z.object({
      resourceType: z.string().describe('The resource type to get the schema for (e.g., "node.version", "homebrew/package", "file/create")'),
      includeExamples: z.boolean().optional().default(true).describe('Whether to include example values in the schema')
    }),
    // outputSchema: z.object({
    //   type: z.string().describe('The resource type'),
    //   description: z.string().describe('Human-readable description of what this resource does'),
    //   schema: z.object({
    //     type: z.string(),
    //     properties: z.record(z.string(), z.unknown()),
    //     required: z.array(z.string()).optional()
    //   }).describe('The JSON schema for the resource parameters')
    // })
  },
  async handler(args) {
    try {
      const resourceType = args.resourceType?.toLowerCase() || '';

      // TODO: In the future, fetch from /v1/registry/resources/search?q=${resourceType}
      // const response = await fetch(`https://api.codifycli.com/v1/registry/resources/search?q=${encodeURIComponent(resourceType)}`);
      // const data = await response.json();

      // For now, use mock data
      if (!MOCK_RESOURCE_SCHEMAS[resourceType]) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: `No schema found for resource type: ${args.resourceType}`,
                availableResources: Object.keys(MOCK_RESOURCE_SCHEMAS),
                error: `Resource type "${args.resourceType}" is not recognized`,
                note: 'This is currently using mock data. In the future, this will fetch from the registry API.'
              }, null, 2)
            }
          ]
        };
      }

      const resourceSchema = MOCK_RESOURCE_SCHEMAS[resourceType];
      const { type, description } = resourceSchema;

      // Optionally remove examples if not requested
      let { schema } = resourceSchema;
      if (!args.includeExamples) {
        schema = JSON.parse(JSON.stringify(schema)); // Deep clone
        Object.keys(schema.properties).forEach(key => {
          const prop = schema.properties[key] as Record<string, unknown>;
          delete prop.examples;
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              type,
              description,
              schema,
              note: 'This is currently using mock data. In the future, this will fetch from the /v1/registry/resources/search endpoint.'
            }, null, 2)
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
              message: 'Failed to retrieve resource schema',
              error: errorMessage
            }, null, 2)
          }
        ]
      };
    }
  }
});

export default definition;
