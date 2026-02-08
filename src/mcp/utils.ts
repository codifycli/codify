import { McpServer, RegisteredTool, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDefinition
<OutputArgs extends AnySchema | ZodRawShapeCompat, InputArgs extends AnySchema | ZodRawShapeCompat | undefined = undefined>
{
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: InputArgs;
    outputSchema?: OutputArgs;
    annotations?: ToolAnnotations;
    _meta?: Record<string, unknown>;
  }
  handler: ToolCallback<InputArgs>;
}

export function registerTool
<OutputArgs extends AnySchema | ZodRawShapeCompat, InputArgs extends AnySchema | ZodRawShapeCompat | undefined = undefined>
(server: McpServer, { name, config, handler }: ToolDefinition<OutputArgs, InputArgs>): RegisteredTool {
  return server.registerTool(name, config, handler);
}

/**
 * The generics wasn't auto inferring the OutputArgs and InputArgs properly. Use this function to create a ToolDefinition.
 * @param obj
 */
export function createToolDefinition
<OutputArgs extends AnySchema | ZodRawShapeCompat, InputArgs extends AnySchema | ZodRawShapeCompat | undefined = undefined>
(obj: ToolDefinition<OutputArgs, InputArgs>): typeof obj {
  return obj;
}
