import z from 'zod';
import { ResourceSchema } from 'codify-schemas';

import { ApplyOrchestrator } from '../../orchestrators/apply.js';
import { ReporterFactory, ReporterType } from '../../ui/reporters/reporter.js';
import { createToolDefinition } from '../utils.js';

const definition = createToolDefinition({
  name: 'apply',
  config: {
    description: 'Apply infrastructure changes based on a Codify configuration file. This will execute the planned changes to bring the system to the desired state.',
    inputSchema: z.object({
      path: z.string().optional().describe('Path to the Codify configuration file or directory. If not provided, uses the current directory.'),
      verbosityLevel: z.number().optional().default(0).describe('Set verbosity level (0-3) for detailed output.'),
      config: z.fromJSONSchema(ResourceSchema as any).optional()
    }),
    // outputSchema: z.object({
    //   success: z.boolean().describe('Whether the apply operation was successful'),
    //   message: z.string().describe('Status message from the apply operation'),
    //   error: z.string().optional().describe('Error message if the operation failed')
    // }),
  },
  async handler(args) {
    try {
      const reporter = ReporterFactory.create(ReporterType.MCP);

      await ApplyOrchestrator.run({
        path: args.path,
        verbosityLevel: args.verbosityLevel ?? 0,
        noProgress: true // Disable progress for MCP
      }, reporter);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Changes applied successfully'
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
              message: 'Apply operation failed',
              error: errorMessage
            }, null, 2)
          }
        ]
      };
    }
  }
});

export default definition;

