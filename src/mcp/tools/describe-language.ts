import z from 'zod';

import { createToolDefinition } from '../utils.js';

const definition = createToolDefinition({
  name: 'describe_language',
  config: {
    description: 'Describe the Codify configuration language. This tool provides educational information about how to write Codify configurations, including the language structure, JSON schemas, rules, and best practices. This is a read-only virtual resource that exists purely for teaching purposes.',
    inputSchema: z.object({
      format: z.enum(['json', 'jsonc']).optional().default('jsonc').describe('The format to return the language description in (json or jsonc)'),
      includeSchemas: z.boolean().optional().default(true).describe('Whether to include the JSON schemas in the response')
    }),
    // outputSchema: z.object({
    //   name: z.string().describe('Name of the language'),
    //   version: z.string().describe('Version of the language specification'),
    //   structure: z.object({
    //     configFile: z.string().describe('Description of the config file structure'),
    //     resources: z.string().describe('Description of resource blocks'),
    //     builtInParameters: z.string().describe('Description of built-in resource parameters'),
    //     customParameters: z.string().describe('Description of custom resource parameters')
    //   }).describe('Core structural concepts'),
    //   schemas: z.object({
    //     configFile: z.record(z.string(), z.unknown()).optional().describe('JSON schema for the config file'),
    //     resource: z.record(z.string(), z.unknown()).optional().describe('JSON schema for resource objects'),
    //     exampleResource: z.record(z.string(), z.unknown()).optional().describe('Example resource schema (homebrew)')
    //   }).optional().describe('JSON schemas'),
    //   rules: z.array(z.string()).describe('Fundamental rules of the language'),
    //   examples: z.object({
    //     basic: z.string().describe('Basic resource example'),
    //     multiple: z.string().describe('Multiple resources example'),
    //     withBuiltIns: z.string().describe('Resource with built-in parameters example'),
    //     complete: z.string().describe('Complete example with multiple resources')
    //   }).optional().describe('Example configurations'),
    //   bestPractices: z.array(z.string()).optional().describe('Best practices for writing Codify configurations')
    // })
  },
  async handler(args) {
    try {
      const format = args.format ?? 'jsonc';
      const includeSchemas = args.includeSchemas ?? true;

      const configFileSchema = {
        '$schema': 'http://json-schema.org/draft-07/schema',
        '$id': 'https://www.codifycli.com/config-file-schema.json',
        'title': 'Config file Schema',
        'type': 'array',
        'items': {
          'type': 'object',
          'properties': {
            'type': {
              'type': 'string',
              'description': 'All config blocks must contain the keyword type',
              'pattern': '^[a-zA-Z][\\w-]+$'
            }
          },
          'required': ['type']
        }
      };

      const resourceSchema = {
        '$schema': 'http://json-schema.org/draft-07/schema',
        '$id': 'https://www.codifycli.com/resource-schema.json',
        'title': 'Resource Schema',
        'type': 'object',
        'properties': {
          'type': {
            'description': 'The resource type',
            'type': 'string',
            'pattern': '^[a-zA-Z][\\w-]+$'
          },
          'os': {
            'type': 'array',
            'items': {
              'enum': ['linux', 'macOS', 'windows']
            },
            'uniqueItems': true
          },
          'name': {
            'description': 'Optional name. Useful for specifying multiple resources of the same type',
            'type': 'string',
            'pattern': '^[\\w-]+$'
          },
          'dependsOn': {
            'type': 'array',
            'items': {
              'type': 'string'
            },
            'uniqueItems': true
          }
        },
        'required': ['type']
      };

      const exampleResourceSchema = {
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
      };

      const languageDescription: Record<string, unknown> = {
        name: 'Codify Configuration Language',
        version: '1.0',
        structure: {
          configFile: 'Codify configurations are JSON/JSONC arrays containing resource objects. Each resource must have a "type" property.',
          resources: 'Resources are declarative blocks that describe the desired system state. Each resource has a type that determines its functionality.',
          builtInParameters: 'All resources support built-in parameters: type (required), name (optional identifier), os (platform filter), and dependsOn (dependency array).',
          customParameters: 'Each resource type defines its own custom parameters specific to its functionality (e.g., homebrew has formulae, casks, taps).'
        },
        rules: [
          'Configurations must be a JSON/JSONC array of resource objects',
          'Every resource must have a "type" property that matches pattern ^[a-zA-Z][\\w-]+$',
          'Resource types are declarative - they describe desired state, not imperative commands',
          'Ordering - resources are evaluated based on dependencies (dependsOn), internal ordering rules (resource based), and then array order',
          'Idempotent - running the same config multiple times produces the same result',
          'Type-safe - all parameters are validated against the resource\'s JSON schema',
          'No shell commands - use resource types instead of imperative scripts'
        ],
        examples: {
          basic: `[
  {
    "type": "homebrew",
    "formulae": ["git"]
  }
]`,
          multiple: `[
  {
    "type": "homebrew",
    "formulae": ["git", "node", "docker"]
  },
  {
    "type": "nvm",
    "nodeVersions": ["20"],
    "global": "20"
  }
]`,
          withBuiltIns: `[
  {
    "type": "homebrew",
    "name": "dev-tools",
    "os": ["macOS"],
    "formulae": ["git", "docker"]
  },
  {
    "type": "nvm",
    "name": "node-setup",
    "dependsOn": ["homebrew.dev-tools"],
    "nodeVersions": ["20"],
    "global": "20"
  }
]`,
          complete: `[
  {
    "type": "homebrew",
    "name": "package-manager",
    "formulae": ["git", "curl"],
    "casks": ["visual-studio-code", "docker"]
  },
  {
    "type": "nvm",
    "dependsOn": ["homebrew.package-manager"],
    "nodeVersions": ["18", "20"],
    "global": "20"
  },
  {
    "type": "git-repository",
    "repository": "https://github.com/user/project.git",
    "parentDirectory": "~/projects"
  },
  {
    "type": "alias",
    "alias": "ll",
    "value": "ls -lah"
  }
]`
        },
        bestPractices: [
          'Use JSONC format to add comments explaining complex configurations',
          'Use the "name" parameter to identify resources when using multiple of the same type',
          'Use "dependsOn" to explicitly declare dependencies between resources',
          'Use "os" parameter to create cross-platform configs that work on different operating systems',
          'Group related resources together in the array for better readability',
          'Test configurations with `codify plan` before applying to see what changes will be made',
          'Validate configurations with `codify validate` to catch errors early',
          'Use version control to track configuration changes over time',
          'Keep configurations DRY - avoid repeating similar resource definitions',
          'Use descriptive resource names that indicate their purpose'
        ]
      };

      if (includeSchemas) {
        languageDescription.schemas = {
          configFile: configFileSchema,
          resource: resourceSchema,
          exampleResource: exampleResourceSchema
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: format === 'json'
              ? JSON.stringify(languageDescription, null, 2)
              : `// Codify Configuration Language Reference
// This describes the structure and rules for writing Codify configurations

${JSON.stringify(languageDescription, null, 2)}`
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
              message: 'Failed to describe language',
              error: errorMessage
            }, null, 2)
          }
        ]
      };
    }
  }
});

export default definition;
