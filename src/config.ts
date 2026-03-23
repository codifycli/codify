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
  supabaseUrl: 'https://kdctbvqvqjfquplxhqrm.supabase.co',

  isBeta: VERSION.includes('beta'),
}
