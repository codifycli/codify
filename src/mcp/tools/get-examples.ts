import z from 'zod';

import { createToolDefinition } from '../utils.js';

/**
 * Example configurations for various resource types and use cases.
 * These examples serve as few-shot training data for LLMs at runtime.
 */
const RESOURCE_EXAMPLES: Record<string, Record<string, Array<{
  description: string;
  config: Record<string, unknown>;
}>>> = {
  'node.version': {
    'frontend development': [
      {
        description: 'Install Node 20 via nvm for frontend development',
        config: {
          type: 'node.version',
          version: '20',
          default: true
        }
      },
      {
        description: 'Install Node 18 LTS for legacy projects',
        config: {
          type: 'node.version',
          version: '18',
          default: false
        }
      }
    ],
    'backend development': [
      {
        description: 'Install Node 20 LTS for production backend',
        config: {
          type: 'node.version',
          version: '20',
          default: true
        }
      }
    ],
    'full-stack development': [
      {
        description: 'Install Node 20 with npm for full-stack projects',
        config: {
          type: 'node.version',
          version: '20',
          default: true,
          packageManager: 'npm'
        }
      }
    ]
  },
  'homebrew/package': {
    'development tools': [
      {
        description: 'Install Git for version control',
        config: {
          type: 'homebrew/package',
          name: 'git',
          state: 'present'
        }
      },
      {
        description: 'Install Docker for containerization',
        config: {
          type: 'homebrew/package',
          name: 'docker',
          state: 'present'
        }
      },
      {
        description: 'Install VS Code for development',
        config: {
          type: 'homebrew/package',
          name: 'visual-studio-code',
          state: 'present'
        }
      }
    ],
    'productivity': [
      {
        description: 'Install Slack for team communication',
        config: {
          type: 'homebrew/package',
          name: 'slack',
          state: 'present'
        }
      },
      {
        description: 'Install Zoom for video conferencing',
        config: {
          type: 'homebrew/package',
          name: 'zoom',
          state: 'present'
        }
      }
    ],
    'system utilities': [
      {
        description: 'Install curl for HTTP requests',
        config: {
          type: 'homebrew/package',
          name: 'curl',
          state: 'present'
        }
      },
      {
        description: 'Install wget for downloading files',
        config: {
          type: 'homebrew/package',
          name: 'wget',
          state: 'present'
        }
      }
    ]
  },
  'file/create': {
    'configuration': [
      {
        description: 'Create a JSON configuration file',
        config: {
          type: 'file/create',
          path: '/etc/myapp/config.json',
          contents: '{\n  "setting": "value"\n}',
          permissions: '0644'
        }
      },
      {
        description: 'Create a shell configuration file',
        config: {
          type: 'file/create',
          path: '~/.bashrc',
          contents: 'export PATH="/usr/local/bin:$PATH"',
          permissions: '0644'
        }
      }
    ],
    'documentation': [
      {
        description: 'Create a README file',
        config: {
          type: 'file/create',
          path: './README.md',
          contents: '# Project Name\n\nProject description here.',
          permissions: '0644'
        }
      }
    ]
  },
  'environment/variable': {
    'development': [
      {
        description: 'Set NODE_ENV for development',
        config: {
          type: 'environment/variable',
          name: 'NODE_ENV',
          value: 'development',
          scope: 'user'
        }
      },
      {
        description: 'Set API endpoint for local development',
        config: {
          type: 'environment/variable',
          name: 'API_URL',
          value: 'http://localhost:3000',
          scope: 'user'
        }
      }
    ],
    'production': [
      {
        description: 'Set NODE_ENV for production',
        config: {
          type: 'environment/variable',
          name: 'NODE_ENV',
          value: 'production',
          scope: 'system'
        }
      }
    ]
  },
  'shell/alias': {
    'productivity': [
      {
        description: 'Create alias for listing files with details',
        config: {
          type: 'shell/alias',
          name: 'll',
          command: 'ls -lah'
        }
      },
      {
        description: 'Create alias for git status',
        config: {
          type: 'shell/alias',
          name: 'gs',
          command: 'git status'
        }
      }
    ],
    'development': [
      {
        description: 'Create alias for npm start',
        config: {
          type: 'shell/alias',
          name: 'start',
          command: 'npm start'
        }
      }
    ]
  }
};

const definition = createToolDefinition({
  name: 'get_examples',
  config: {
    description: 'Get example configurations for a specific resource type and use case. These examples serve as few-shot training data for LLMs, helping them learn the correct syntax and patterns for writing Codify configurations. Examples are the fastest way for LLMs to learn valid configuration snippets.',
    inputSchema: z.object({
      resource: z.string().describe('The resource type to get examples for (e.g., "node.version", "homebrew/package", "file/create")'),
      useCase: z.string().optional().describe('The specific use case or context (e.g., "frontend development", "production", "system utilities"). If not provided, returns examples for all use cases.')
    }),
    // outputSchema: z.object({
    //   resource: z.string().describe('The resource type'),
    //   useCase: z.string().optional().describe('The use case if specified'),
    //   examples: z.array(
    //     z.object({
    //       description: z.string().describe('Human-readable description of what this example does'),
    //       config: z.record(z.string(), z.unknown()).describe('The actual configuration object that can be used in a Codify file')
    //     })
    //   ).describe('Array of example configurations')
    // })
  },
  async handler(args) {
    try {
      const resource = args.resource?.toLowerCase() || '';
      const useCase = args.useCase?.toLowerCase();

      // Check if resource exists
      if (!RESOURCE_EXAMPLES[resource]) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: `No examples found for resource type: ${args.resource}`,
                availableResources: Object.keys(RESOURCE_EXAMPLES),
                error: `Resource "${args.resource}" is not recognized`
              }, null, 2)
            }
          ]
        };
      }

      const resourceExamples = RESOURCE_EXAMPLES[resource];

      // If useCase is specified, get examples for that use case
      if (useCase) {
        if (!resourceExamples[useCase]) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  message: `No examples found for use case: ${args.useCase}`,
                  availableUseCases: Object.keys(resourceExamples),
                  error: `Use case "${args.useCase}" is not available for resource "${args.resource}"`
                }, null, 2)
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                resource: args.resource,
                useCase: args.useCase,
                examples: resourceExamples[useCase]
              }, null, 2)
            }
          ]
        };
      }

      // If no useCase specified, return all examples for the resource
      const allExamples = Object.values(resourceExamples).flat();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              resource: args.resource,
              examples: allExamples,
              note: 'Showing all examples for this resource. Specify a useCase parameter to filter by specific use case.'
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
              message: 'Failed to retrieve examples',
              error: errorMessage
            }, null, 2)
          }
        ]
      };
    }
  }
});

export default definition;
