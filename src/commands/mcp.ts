import { BaseCommand } from '../common/base-command.js';
import { startMcpServer } from '../mcp/index.js';

export default class Mcp extends BaseCommand {
  static description =
`Run a MCP (model context protocol) server to allow LLMs to use Codify as a tool.

This command starts a Model Context Protocol (MCP) server that enables Large Language Models
(LLMs) and AI assistants to interact with Codify programmatically. The server exposes Codify's
functionality as tools that can be called by compatible MCP clients.

The MCP server allows LLMs to:
- Resolve and read Codify configuration files
- Generate execution plans for infrastructure changes
- Apply infrastructure changes
- Validate Codify configurations
- Interact with Codify's full feature set through a standardized protocol

This is useful for integrating Codify with AI-powered development tools, IDEs, and
automation platforms that support the Model Context Protocol.

For more information, visit: https://docs.codifycli.com/commands/mcp
`

  static flags = {}

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    await startMcpServer();
  }
}
