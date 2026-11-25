## Notarize script

Set up notarize profiles first (see notion).
Run notarize script from scripts folder.
Make sure that issues is null in the log.

## Upload

Populate the .env file

## Upload core resources

Uploads the CLI's core config blocks (`project`, `template`, `variable`, `notice`) to the resource library (the
registry tables the default plugin's deploy writes to), so the dashboard editor and the agent can find them. Schemas
come from `@codifycli/schemas`; default and example configs are in `core-resources.ts`.

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (environment or `.env`), and optionally `REINDEX_API_KEY`.

```bash
npm run upload:core-resources -- --dry-run      # print the rows only
npm run upload:core-resources                   # stable
npm run upload:core-resources -- --prerelease   # beta
```
