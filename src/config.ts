export const VERSION = (await import("../package.json", { with: { type: "json" } })).default.version;

export const config = {
  loginServerPort: 51_039,
  connectServerPort: 51_040,

  corsAllowedOrigins: [
    'https://dashboard.codifycli.com',
    'https://https://codify-dashboard.kevinwang5658.workers.dev',
    'http://localhost:3000'
  ],

  dashboardUrl: 'https://dashboard.codifycli.com',
  apiUrl: 'https://api.codifycli.com',
  supabaseUrl: process.env.CODIFY_SUPABASE_URL ?? 'https://kdctbvqvqjfquplxhqrm.supabase.co',
  // Public (publishable) key: used only to create and refresh anonymous sessions for `codify prompt`
  supabasePublishableKey: process.env.CODIFY_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_vxI27FvatSnyEhCenFvUOQ_JNQuay14',

  // Mastra server hosting the Codify agents (`codify prompt`)
  // TODO(before release): confirm the production agent URL (the dashboard's NEXT_PUBLIC_AGENT_URL)
  agentUrl: process.env.CODIFY_AGENT_URL ?? 'https://agent.codifycli.com',
  cliAgentId: 'codify-cli-agent',
  cliThreadNamespace: 'cli',

  // Beta CLI versions use beta plugins. Set CODIFY_BETA=1 to use beta plugins from a non-beta CLI (ex: local development)
  isBeta: VERSION.includes('beta') || ['1', 'true'].includes(process.env.CODIFY_BETA?.toLowerCase() ?? ''),
}
