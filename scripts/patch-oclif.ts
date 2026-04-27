// Patches node_modules/oclif/lib/tarballs/bin.js to inject bash logic into the shell script
// that oclif generates during `oclif pack tarballs`. This runs via the `postinstall` npm script
// so it re-applies automatically after any `npm install` that updates oclif.
//
// Why: Node.js takes 500ms–1s to start. By handling simple cases in the shell script we can
// give instant feedback before Node launches.
//
// What the injected bash does (inside the else block, before the "$NODE ... $DIR/run" line):
//   - codify --help / -h      → cats dist/static/help.txt and exits (no Node startup)
//   - codify --version / -v   → cats dist/static/version.txt and exits
//   - codify apply/destroy/plan → prints "Running Codify <cmd>..." immediately
//                                 (suppressed when --output json or -o json is passed)
//   - everything else         → falls through to normal Node.js launch
//
// Static files (dist/static/help.txt, dist/static/version.txt) are generated in scripts/pkg.ts
// after the esbuild step by running ./bin/dev.js --help and ./bin/dev.js --version.
// Missing static files are guarded by [ -f ] so all cases fall back to Node gracefully.
//
// Note: console.log('Running Codify apply/destroy...') was removed from src/commands/apply.ts
// and src/commands/destroy.ts to prevent double-printing (shell prints first, Node would repeat it).
//
// If oclif upgrades and changes bin.js structure, this script exits with code 1 so the breakage
// is immediately visible.
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_JS = path.join(__dirname, '../node_modules/oclif/lib/tarballs/bin.js');

if (!existsSync(BIN_JS)) {
  console.log('oclif bin.js not found (likely production install). Skipping.');
  process.exit(0);
}

const content = await fs.readFile(BIN_JS, 'utf8');

if (content.includes('CODIFY_PATCH_START')) {
  console.log('oclif bin.js already patched. Skipping.');
  process.exit(0);
}

const SEARCH = '  if [ "\\$DEBUG" == "*" ]; then\n    echoerr';
const idx = content.lastIndexOf(SEARCH);
if (idx === -1) {
  console.error('ERROR: Could not find insertion point in oclif bin.js. The oclif version may have changed.');
  process.exit(1);
}

// Patch uses \\$ so that it survives the JS string — in the generated shell script each \\$ becomes \$
// which Bash then interprets as a literal $ (not a template substitution in the JS template literal).
const PATCH = `  # CODIFY_PATCH_START — do not remove this marker
  _first_arg="\${1:-}"
  if [ "\\$_first_arg" = "--help" ] || [ "\\$_first_arg" = "-h" ]; then
    _help_file="\\$DIR/../dist/static/help.txt"
    if [ -f "\\$_help_file" ]; then cat "\\$_help_file"; exit 0; fi
  fi
  if [ "\\$_first_arg" = "--version" ] || [ "\\$_first_arg" = "-v" ] || [ "\\$_first_arg" = "version" ]; then
    _version_file="\\$DIR/../dist/static/version.txt"
    if [ -f "\\$_version_file" ]; then cat "\\$_version_file"; exit 0; fi
  fi
  _cmd="\\$_first_arg"
  if [ "\\$_cmd" = "apply" ] || [ "\\$_cmd" = "destroy" ] || [ "\\$_cmd" = "plan" ]; then
    _json_output=0
    _prev=""
    for _a in "\\$@"; do
      if [ "\\$_a" = "--output=json" ] || [ "\\$_a" = "-o=json" ]; then _json_output=1; break; fi
      if [ "\\$_prev" = "--output" ] || [ "\\$_prev" = "-o" ]; then
        if [ "\\$_a" = "json" ]; then _json_output=1; break; fi
      fi
      _prev="\\$_a"
    done
    if [ "\\$_json_output" -eq 0 ]; then echo "Running Codify \\$_cmd..."; fi
  fi
  # CODIFY_PATCH_END — do not remove this marker
`;

await fs.writeFile(BIN_JS, content.slice(0, idx) + PATCH + content.slice(idx), 'utf8');
console.log('Successfully patched oclif bin.js');
