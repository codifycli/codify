/**
 * Uploads the core config blocks of the CLI (project, template, variable, notice) to the resource library, the
 * same registry tables the default plugin's deploy writes its resources to. The dashboard editor and the agent then
 * find, validate and complete them like any other resource. Core blocks are handled by the CLI itself and never sent
 * to a plugin; they are listed under the default plugin, like `project` already is.
 *
 * Schemas come from @codifycli/schemas: bump it first when a schema changes. Default and example configs are in
 * ./core-resources.ts.
 *
 * Usage (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or .env):
 *   npm run upload:core-resources                 # stable resources
 *   npm run upload:core-resources -- --prerelease # beta resources
 *   npm run upload:core-resources -- --dry-run    # print the rows, upload nothing
 * Set REINDEX_API_KEY to refresh the search embeddings afterwards.
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { CORE_RESOURCES, toRegistrySchema } from './core-resources.js';

const PLUGIN_NAME = 'default';
const OPERATING_SYSTEMS = ['Darwin', 'Linux'];
const REINDEX_URL = 'https://api.codifycli.com/v1/embeddings/reindex';

const { values: flags } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    prerelease: { type: 'boolean', default: false },
  },
});
const prerelease = flags.prerelease!;
const dryRun = flags['dry-run']!;

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const rows = CORE_RESOURCES.map((resource) => {
  const schema = toRegistrySchema(resource.schema);
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;

  return {
    // Same columns and encoding as default-plugin/scripts/deploy.ts
    resource: {
      type: resource.type,
      prerelease,
      schema: JSON.stringify(schema),
      documentation_url: typeof schema.$comment === 'string' ? schema.$comment : null,
      allow_multiple: resource.allowMultiple,
      os: OPERATING_SYSTEMS,
      default_config: JSON.stringify(resource.defaultConfig),
      example_config_1: JSON.stringify(resource.exampleConfigs.example1),
      example_config_2: resource.exampleConfigs.example2 ? JSON.stringify(resource.exampleConfigs.example2) : null,
    },
    parameters: Object.entries(properties)
      .filter(([name]) => name !== 'type')
      .map(([name, property]) => ({
        name,
        // Properties with several types (anyOf) have none
        type: typeof property.type === 'string' ? property.type : null,
        prerelease,
        schema: property,
        is_sensitive: false,
      })),
  };
});

if (dryRun) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (environment or .env)');
}

/** A request to Supabase's REST API (PostgREST). Throws on errors. */
async function rest<T>(path: string, init: { body?: unknown; method?: string; prefer?: string } = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} failed (HTTP ${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

const upsert = <T>(table: string, onConflict: string, body: unknown) => rest<T>(
  `${table}?on_conflict=${encodeURIComponent(onConflict)}`,
  { method: 'POST', body, prefer: 'resolution=merge-duplicates,return=representation' },
);

const plugins = await rest<Array<{ id: string; name: string }>>(`registry_plugins?name=eq.${PLUGIN_NAME}&select=id,name`);
if (plugins.length === 0) {
  throw new Error(`The "${PLUGIN_NAME}" plugin is not in the registry. Deploy the default plugin first.`);
}

const { id: pluginId, name: pluginName } = plugins[0];

for (const { resource, parameters } of rows) {
  console.log(`Uploading core resource ${resource.type} (prerelease=${prerelease})`);
  const [{ id: resourceId }] = await upsert<Array<{ id: string }>>('registry_resources', 'type,plugin_id,prerelease', {
    ...resource,
    plugin_id: pluginId,
    plugin_name: pluginName,
  });

  if (parameters.length > 0) {
    await upsert('registry_resource_parameters', 'name,resource_id,prerelease', parameters.map((p) => ({ ...p, resource_id: resourceId })));
  }
}

console.log(`Uploaded ${rows.length} core resources: ${rows.map((r) => r.resource.type).join(', ')}`);

// The search embeddings of the agent are built from the registry
const reindexKey = process.env.REINDEX_API_KEY;
if (reindexKey) {
  console.log('Triggering vector reindex...');
  const response = await fetch(REINDEX_URL, { method: 'POST', headers: { Authorization: `Bearer ${reindexKey}` } });
  console.log(response.ok ? 'Reindex complete' : `Reindex failed: ${response.status} ${await response.text()}`);
} else {
  console.log('REINDEX_API_KEY not set: skipping the search reindex');
}
