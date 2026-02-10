import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { VERSION } from '../config.js'
import apply from './tools/apply.js';
import describeLanguage from './tools/describe-language.js';
import getExamples from './tools/get-examples.js';
import getResourceSchema from './tools/get-resource-schema.js';
import listResources from './tools/list-resources.js';
import { registerTool } from './utils.js';

const server = new McpServer({
  name: 'codify',
  version: '0.0.1',
  description: 'Codify MCP Server - A Model Context Protocol server that enables LLMs to learn and use Codify, ' +
    'a declarative infrastructure-as-code tool for managing development environments. Provides tools for discovering' +
    ' resources, understanding schemas, viewing examples, and applying configurations.',
}, {
  capabilities: {
    tools: true,
  }
})

// Register tools
registerTool(server, apply);
registerTool(server, describeLanguage);
registerTool(server, getExamples);
registerTool(server, getResourceSchema);
registerTool(server, listResources);

/**
 * Start the MCP server
 */
export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Codify MCP server started');
}
//
// export { server };

// export function startMcpServer(): Promise<void> {
//   const app = createMcpExpressApp();
//
//   app.post('/mcp', async (req, res) => {
//     try {
//       const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
//         sessionIdGenerator: undefined
//       });
//       await server.connect(transport);
//       await transport.handleRequest(req, res, req.body);
//       res.on('close', () => {
//         console.log('Request closed');
//         transport.close();
//         server.close();
//       });
//     } catch (error) {
//       console.error('Error handling MCP request:', error);
//       if (!res.headersSent) {
//         res.status(500).json({
//           jsonrpc: '2.0',
//           error: {
//             code: -32_603,
//             message: 'Internal server error'
//           },
//           id: null
//         });
//       }
//     }
//   });
//
//   app.get('/mcp', async (req, res) => {
//     console.log('Received GET MCP request');
//     res.writeHead(405).end(
//       JSON.stringify({
//         jsonrpc: '2.0',
//         error: {
//           code: -32_000,
//           message: 'Method not allowed.'
//         },
//         id: null
//       })
//     );
//   });
//
//   app.delete('/mcp', async (req, res) => {
//     console.log('Received DELETE MCP request');
//     res.writeHead(405).end(
//       JSON.stringify({
//         jsonrpc: '2.0',
//         error: {
//           code: -32_000,
//           message: 'Method not allowed.'
//         },
//         id: null
//       })
//     );
//   });
//
// // Start the server
//   const PORT = 3000;
//   app.listen(PORT, error => {
//     if (error) {
//       console.error('Failed to start server:', error);
//       process.exit(1);
//     }
//
//     console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
//   });
//
// // Handle server shutdown
//   process.on('SIGINT', async () => {
//     console.log('Shutting down server...');
//     process.exit(0);
//   });
//
// }
