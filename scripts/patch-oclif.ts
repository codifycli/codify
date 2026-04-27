// Patches node_modules/oclif/lib/tarballs/bin.js to inject bash logic into the shell script
// that oclif generates during `oclif pack tarballs`. This runs via the `postinstall` npm script
// so it re-applies automatically after any `npm install` that updates oclif.
//
// Why: Node.js takes 500ms–1s to start. By handling simple cases in the shell script we can
// give instant feedback before Node launches.
//
// What the injected bash does (inside the else block, before the "$NODE ... $DIR/run" line):
//   - codify --help / -h           → cats dist/static/help.txt and exits (no Node startup)
//   - codify <cmd> --help / -h     → cats dist/static/<cmd>-help.txt and exits
//   - codify --version / -v        → cats dist/static/version.txt and exits
//   - codify apply/destroy/plan    → prints "Running Codify <cmd>..." immediately
//                                    (suppressed when --output json or -o json is passed)
//   - everything else              → falls through to normal Node.js launch
//
// Static files (dist/static/*.txt) are generated in scripts/pkg.ts after the esbuild step.
// Missing static files are guarded by [ -f ] so all cases fall back to Node gracefully.
//
// Note: console.log('Running Codify apply/destroy...') was removed from src/commands/apply.ts
// and src/commands/destroy.ts to prevent double-printing (shell prints first, Node would repeat it).
//
// Also patches node_modules/oclif/lib/commands/pack/macos.js to add
// `sudo rm -rf ~/.local/share/codify` to the macOS installer's preinstall script.
// This fixes an oclif bug where the auto-updater cache (~/.local/share/codify) isn't cleared
// on fresh installs, causing the old cached version to be used. The patch must happen before
// `oclif pack macos` runs — modifying the .pkg after the fact breaks notarization.
//
// If oclif upgrades and changes either file's structure, this script exits with code 1 so the
// breakage is immediately visible.
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_JS = path.join(__dirname, '../node_modules/oclif/lib/tarballs/bin.js');
const MACOS_JS = path.join(__dirname, '../node_modules/oclif/lib/commands/pack/macos.js');

if (!existsSync(BIN_JS)) {
  console.log('oclif bin.js not found (likely production install). Skipping.');
  process.exit(0);
}

let content = await fs.readFile(BIN_JS, 'utf8');

if (content.includes('CODIFY_PATCH_START')) {
  console.log('Removing existing patch to reapply...');
  content = content.replace(/  # CODIFY_PATCH_START[\s\S]*?# CODIFY_PATCH_END[^\n]*\n/, '');
}

const SEARCH = '  if [ "\\$DEBUG" == "*" ]; then\n    echoerr';
const idx = content.lastIndexOf(SEARCH);
if (idx === -1) {
  console.error('ERROR: Could not find insertion point in oclif bin.js. The oclif version may have changed.');
  process.exit(1);
}

// Patch uses \\$ so that it survives the JS string — in the generated shell script each \\$ becomes \$
// which bash then interprets as a literal $ (not a template substitution in the JS template literal).
// Bash default-value syntax ${1:-} is avoided since ${...} would be evaluated as a JS template expression.
const PATCH = `  # CODIFY_PATCH_START — do not remove this marker
  _first_arg=""
  if [ "\\$#" -gt 0 ]; then _first_arg="\\$1"; fi
  _second_arg=""
  if [ "\\$#" -gt 1 ]; then _second_arg="\\$2"; fi
  if [ "\\$_first_arg" = "--help" ] || [ "\\$_first_arg" = "-h" ]; then
    _help_file="\\$DIR/../dist/static/help.txt"
    if [ -f "\\$_help_file" ]; then cat "\\$_help_file"; exit 0; fi
  fi
  if [ "\\$_second_arg" = "--help" ] || [ "\\$_second_arg" = "-h" ]; then
    _cmd_help_file="\\$DIR/../dist/static/\\$_first_arg-help.txt"
    if [ -f "\\$_cmd_help_file" ]; then cat "\\$_cmd_help_file"; exit 0; fi
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

const patched = content.slice(0, idx) + PATCH + content.slice(idx);

// Use exec to replace the shell process with Node rather than spawning a child.
// This avoids an extra process in memory and ensures signals go directly to Node.
const NODE_LAUNCH = '  "\\$NODE" ';
const NODE_LAUNCH_EXEC = '  exec "\\$NODE" ';
let withExec = patched;
if (patched.includes(NODE_LAUNCH) && !patched.includes(NODE_LAUNCH_EXEC)) {
  withExec = patched.replace(NODE_LAUNCH, NODE_LAUNCH_EXEC);
} else if (!patched.includes(NODE_LAUNCH_EXEC)) {
  console.error('ERROR: Could not find Node launch line to add exec. The oclif version may have changed.');
  process.exit(1);
}

await fs.writeFile(BIN_JS, withExec, 'utf8');
console.log('Successfully patched oclif bin.js');

// Patch macos.js preinstall script to also clear the auto-updater cache directory.
// Oclif's auto-updater stores binaries in ~/.local/share/codify and the macOS installer
// doesn't clean this up, so fresh installs still run the old cached version.
// We must patch the template before `oclif pack macos` runs — modifying the .pkg after
// the fact breaks notarization since the binary has been tampered with.
const SEARCH_PREINSTALL = 'sudo rm -rf /usr/local/bin/${config.bin}\n${additionalCLI';
const PATCH_PREINSTALL  = 'sudo rm -rf /usr/local/bin/${config.bin}\nsudo rm -rf ~/.local/share/${config.dirname}\n${additionalCLI';

if (!existsSync(MACOS_JS)) {
  console.log('oclif macos.js not found. Skipping preinstall patch.');
} else {
  const macosContent = await fs.readFile(MACOS_JS, 'utf8');
  if (macosContent.includes(PATCH_PREINSTALL)) {
    console.log('oclif macos.js preinstall already patched. Skipping.');
  } else if (!macosContent.includes(SEARCH_PREINSTALL)) {
    console.error('ERROR: Could not find preinstall insertion point in oclif macos.js. The oclif version may have changed.');
    process.exit(1);
  } else {
    await fs.writeFile(MACOS_JS, macosContent.replace(SEARCH_PREINSTALL, PATCH_PREINSTALL), 'utf8');
    console.log('Successfully patched oclif macos.js preinstall script');
  }
}
