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
  supabaseUrl: 'https://kdctbvqvqjfquplxhqrm.supabase.co',

  // Beta CLI versions use beta plugins. Set CODIFY_BETA=1 to use beta plugins from a non-beta CLI (ex: local development)
  isBeta: VERSION.includes('beta') || ['1', 'true'].includes(process.env.CODIFY_BETA?.toLowerCase() ?? ''),
}
