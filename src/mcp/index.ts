import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { VERSION } from '../config.js'
import { PlanArgs, PlanOrchestrator } from '../orchestrators/plan.js';
import { ValidateArgs, ValidateOrchestrator } from '../orchestrators/validate.js';
import { ReporterFactory, ReporterType } from '../ui/reporters/reporter.js';
import apply from './tools/apply.js';
import { registerTool } from './utils.js';

const server = new McpServer({
  name: 'codify',
  version: VERSION,
  description: 'Codify is a tool'
})

// Register the apply tool
registerTool(server, apply);

// Initialize a reporter for MCP operations
const reporter = ReporterFactory.create(ReporterType.MCP);

/**
 * Register additional tools for plan, validate, and get_plan_summary
 */
server.registerTool(
  'plan',
  {
    description: 'Generate an execution plan for Codify configuration changes. This analyzes the current system state and compares it with the desired configuration to determine what changes need to be made.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the Codify configuration file or directory. If not provided, uses the current directory.'
        },
        secureMode: {
          type: 'boolean',
          description: 'Enable secure mode to skip sensitive information in output.',
          default: false
        },
        verbosityLevel: {
          type: 'number',
          description: 'Set verbosity level (0-3) for detailed output.',
          default: 0
        }
      }
    }
  },
  async (params: { path?: string; secureMode?: boolean; verbosityLevel?: number }) => {
    try {
      const planArgs: PlanArgs = {
        path: params.path,
        secureMode: params.secureMode ?? false,
        verbosityLevel: params.verbosityLevel ?? 0,
        noProgress: true // Disable progress for MCP
      };

      const result = await PlanOrchestrator.run(planArgs, reporter);

      return {
        success: true,
        message: 'Plan generated successfully',
        planSummary: {
          totalResources: result.plan.resources.length,
          changes: result.plan.raw.map(r => ({
            resourceType: r.resourceType,
            resourceName: r.resourceName,
            operation: r.operation
          }))
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: 'Plan generation failed',
        error: errorMessage
      };
    }
  }
);

server.registerTool(
  'validate',
  {
    description: 'Validate a Codify configuration file for syntax errors and configuration issues. This checks that the configuration is valid before applying changes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the Codify configuration file or directory. If not provided, uses the current directory.'
        },
        verbosityLevel: {
          type: 'number',
          description: 'Set verbosity level (0-3) for detailed output.',
          default: 0
        }
      }
    }
  },
  async (params: { path?: string; verbosityLevel?: number }) => {
    try {
      const validateArgs: ValidateArgs = {
        path: params.path,
        verbosityLevel: params.verbosityLevel ?? 0,
        noProgress: true // Disable progress for MCP
      };

      await ValidateOrchestrator.run(validateArgs, reporter);

      return {
        success: true,
        message: 'Configuration is valid'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: 'Validation failed',
        error: errorMessage
      };
    }
  }
);

server.registerTool(
  'get_plan_summary',
  {
    description: 'Get a summary of what changes would be made without applying them. Useful for understanding the impact of configuration changes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the Codify configuration file or directory.'
        }
      }
    }
  },
  async (params: { path?: string }) => {
    try {
      const planArgs: PlanArgs = {
        path: params.path,
        noProgress: true
      };

      const result = await PlanOrchestrator.run(planArgs, reporter);

      return {
        configPath: params.path || 'current directory',
        totalResources: result.plan.resources.length,
        changes: result.plan.raw.map(r => ({
          type: r.resourceType,
          name: r.resourceName,
          operation: r.operation
        })),
        isEmpty: result.plan.isEmpty()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: 'Plan summary generation failed',
        error: errorMessage
      };
    }
  }
);

/**
 * Start the MCP server
 */
export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Codify MCP server started');
}

export { server };
