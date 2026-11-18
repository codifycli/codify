# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Codify is a configuration-as-code CLI tool that brings Infrastructure-as-Code principles to local development environments. It allows developers to declaratively define their development setup (packages, tools, system settings) in configuration files and apply them in a reproducible way. Think "Terraform for your local machine."

## Development Commands

### Building
```bash
npm run build              # Build TypeScript to dist/
npm run lint               # Type-check with tsc
npm run lint:eslint        # ESLint (flat config in eslint.config.js). Not enforced in CI yet: existing violations
```

### Testing
```bash
npm test                   # Run all tests with Vitest
npm test -- path/to/test   # Run specific test file
npm run posttest           # Runs lint after tests
```

### Running Locally
```bash
./bin/dev.js <command>     # Run CLI in development mode
./bin/dev.js apply         # Example: run apply command
CODIFY_BETA=1 ./bin/dev.js destroy alias   # Use the latest beta plugins instead of the latest stable
npm run start:dev:beta -- destroy alias   # Same as above
```

### Test Command (VM Testing)
The `test` command spins up a Tart VM to test Codify configs in isolation:
```bash
./bin/dev.js test --vm-os darwin   # Test on macOS VM
./bin/dev.js test --vm-os linux    # Test on Linux VM
```

## High-Level Architecture

### Core Architectural Patterns

1. **Command-Orchestrator Pattern**: Commands (`src/commands/`) are thin oclif wrappers. Orchestrators (`src/orchestrators/`) contain all business logic and workflow coordination. This separation enables reusability.

2. **Multi-Process Plugin System**: The most unique architectural decision is running plugins as separate Node.js child processes communicating via IPC:
   - **Why**: Isolation (crashes don't crash CLI), security (parent controls sudo), flexibility
   - **Plugin Process** (`src/plugins/plugin-process.ts`): Spawns plugins using `fork()`
   - **IPC Protocol** (`src/plugins/plugin-message.ts`): Type-safe message passing
   - **Security**: Plugins run isolated; parent process controls all sudo operations
   - When plugins need sudo, they send `COMMAND_REQUEST` events back to parent

3. **Event-Driven Architecture**: Central event bus (`src/events/context.ts`) using EventEmitter:
   - Tracks process/subprocess lifecycle (PLAN, APPLY, INITIALIZE_PLUGINS, etc.)
   - Enables plugin-to-CLI communication (sudo prompts, login credentials, etc.)
   - Powers progress tracking for UI

4. **Reporter Pattern**: Abstract `Reporter` interface with multiple implementations selected via `--output` flag:
   - `DefaultReporter`: Rich Ink-based TUI with React components
   - `PlainReporter`: Simple text output
   - `JsonReporter`: Machine-readable JSON
   - `DebugReporter`: Verbose logging
   - `StubReporter`: No-op for testing

5. **Resource Lifecycle State Machine**:
   ```
   Parse Config → Validate → Resolve Dependencies → Plan → Apply
   ```
   - **ResourceConfig**: Desired state from config file
   - **Plan**: Computed difference between desired and current state
   - **ResourcePlan**: Per-resource operations (CREATE, UPDATE, DELETE, NOOP)
   - **Project**: Container with dependency graph

6. **Dependency Resolution**:
   - Explicit: `dependsOn` field in config
   - Implicit: Extracted from parameter references (e.g., `${other-resource.param}`)
   - Plugin-level: Plugins declare type dependencies (e.g., xcode-tools on macOS)
   - Topological sort ensures correct evaluation order (`src/utils/dependency-graph-resolver.ts`)

### Key Directory Structure

- **`/src/orchestrators/`**: Business logic layer - each file implements one CLI command's workflow
  - `plan.ts`: Parse → Validate → Resolve deps → Generate plan
  - `apply.ts`: Execute plan after user confirmation
  - `import.ts`: Import existing resources into config
  - `test.ts`: VM-based testing with live config sync via file watcher

- **`/src/plugins/`**: Plugin infrastructure
  - `plugin-manager.ts`: Registry routing operations to plugins
  - `plugin-process.ts`: Child process lifecycle and IPC
  - `plugin.ts`: High-level plugin API

- **`/src/entities/`**: Domain models with rich behavior
  - `Project`: Container with dependency resolution
  - `ResourceConfig`: Mutable config with dependency tracking
  - `Plan`: Immutable plan with sorting/filtering

- **`/src/parser/`**: Multi-format config parsing (JSON, JSONC, JSON5, YAML)
  - All parsers maintain source maps for error messages
  - Cloud parser fetches from Dashboard API via UUID

- **`/src/ui/`**: User interface layer
  - `/reporters/`: Output strategy implementations
  - `/components/`: React components for Ink TUI
  - `/store/`: Jotai state management for UI

- **`/src/connect/`**: Dashboard integration
  - WebSocket server for persistent connection
  - OAuth flow handling
  - JWT credential management

- **`/src/generators/`**: Config file writers
  - Computes diffs for updating existing configs
  - Writes to local files or cloud (via Dashboard API)

### Important Data Flows

**Apply Command Flow:**
```
ApplyOrchestrator.run()
  → PlanOrchestrator.run()
    → PluginInitOrchestrator.run()
      → Parse configs → Project
      → PluginManager.initialize() → ResourceDefinitions
    → Project.resolveDependencies()
    → PluginManager.plan() → Plan
  → Reporter.promptConfirmation()
  → PluginManager.apply()
    → For each resource (topologically sorted):
      → Plugin.apply() [IPC to child process]
```

**Plugin Communication Flow:**
```
Parent Process              Plugin Process
    |-- initialize() -------->|
    |<-- resourceDefinitions -|
    |-- plan(resource) ------>|
    |          [Plugin needs sudo]
    |<-- COMMAND_REQUEST -----|
    |-- prompt user           |
    |-- COMMAND_GRANTED ----->|
    |<-- PlanResponse --------|
```

### Key Architectural Decisions

1. **Single file Projects**: Projects only currently support one file
2. **Cloud-First**: UUIDs are valid "file paths" - enables seamless local/cloud switching
3. **XCode Tools Injection**: On macOS, `xcode-tools` automatically prepended (most resources depend on it)
4. **Test VM Strategy**: Uses Tart VMs with bind mounts (not copying) + file watcher for live config editing
5. **OS Filtering**: Resources specify `os: ["Darwin", "Linux"]` for conditional inclusion
6. **Secure Mode**: `--secure` flag forces sudo prompt for every command (no password caching)

### Common Implementation Patterns

1. **Plugin Resolution**: Local plugins use file paths (`.ts`/`.js`), network plugins use semver versions
2. **Source Maps**: Preserved through entire parse → validate → plan flow for accurate error messages
3. **Event Timing**: Events fire synchronously; use `ctx.once()` carefully to avoid race conditions
4. **Process Cleanup**: Plugins must be killed on exit via `registerKillListeners`
5. **Reporter Lifecycle**: Call `reporter.hide()` before synchronous output to prevent UI corruption

### Testing Patterns

- **Ink Component Tests**: Must polyfill `console.Console` for test environment:
  ```typescript
  import { Console } from 'node:console';
  if (!console.Console) {
    console.Console = Console;
  }
  ```
- **Plugin Tests**: Use `StubReporter` to avoid UI initialization
- **VM Tests**: `test` command uses Tart VMs with bind mounts for integration testing

## Agent Chat (`codify prompt`)

`codify` with no arguments (or `codify prompt [message]`, `--resume`) starts a chat with the Codify agent (`codify-cli-agent`, a Mastra agent in `codify-infrastructure`). Code lives in `src/prompt/`, `src/orchestrators/prompt.tsx` and `src/commands/prompt.ts`.

- **Runtime**: `@assistant-ui/react-ink` primitives + `useChatRuntime` from `@assistant-ui/ai-sdk`, posting to `${config.agentUrl}/chat/codify-cli-agent`. Only the newest message is sent; Mastra memory holds the history. Threads are tagged `metadata.namespace = 'cli'` (separate from the dashboard's lists).
- **Client tools** (`read_file`, `list_directory`, `search_files`, `run_command`, `codify_plan`, `codify_apply`) are defined on the server without `execute` and run locally via the toolkit in `ui/chat-app.tsx`. `shouldSendToolResults` resubmits only when a step with client tools is complete (never for `ask_question`).
- **Safety**: `tools/command-policy.ts` is a deny-by-default allowlist of read-only commands; everything else needs the user's approval, and `sudo` always does. `tools/path-guard.ts` blocks secret paths (SSH keys, credentials, `.env`, ...) for every tool.
- **Plan/apply**: the command supplies an *embedded* `DefaultReporter` (`createReporter` hook in `BaseCommand`) whose UI is rendered inside the chat's Ink app. Ink renders only one `<Static>` per app, so in embedded mode the reporter's permanent output goes through `StaticOutput` → `StaticSinkContext` and the chat places it in the `codify_apply` tool card. `ApplyOrchestrator` returns an outcome instead of exiting, and `PluginManager.dispose()` must be called after each plan/apply in long-lived processes.
- **Auth**: logged-in users use their CLI token; otherwise a Supabase anonymous session (`~/.codify/anonymous-session.json`, refreshed automatically) gets a few free prompts.
- **Keep the live area small** (`ui/transcript.ts`): Ink redraws the non-`<Static>` area every frame, and once it is taller than the terminal it redraws the whole screen, leaving a copy of every frame in the scrollback. Finished parts of the running message are moved into the `<Static>` transcript as soon as they are final; only the part in progress renders live, and streaming text is cut to the last lines that fit. Don't render whole messages (or the plan) in the live area.
- **Mixed steps**: when the model calls a client tool and a server tool in the same step, Mastra ends the run without running the server tool. `shouldSendToolResults` (`ui/client-tools.ts`) only waits for the client tools' results; the skipped server call is shown as "(skipped)".
- **Ephemeral configs** are written to `~/.codify/sessions/<threadId>/NNN.codify.jsonc`, never into project files.
- **Tests**: `test/prompt/prompt-e2e.test.ts` runs the real CLI in a pty against a fake agent (`test/prompt/fixtures/`). `CODIFY_AGENT_URL`, `CODIFY_SUPABASE_URL` and `CODIFY_SUPABASE_PUBLISHABLE_KEY` override the endpoints.

## Build & Distribution

- **Framework**: oclif CLI framework with manifest generation
- **Module System**: ES modules with NodeNext resolution
- **Packaging**: `oclif pack tarballs` for multi-platform binaries
- **Updates**: Self-updating via S3 (`@oclif/plugin-update`)
- **Code Signing**: macOS notarization via `scripts/notarize.sh`

## Common Gotchas

1. **Import Paths**: Use `.js` extensions in imports even though files are `.ts` (ES module resolution)
2. **Schema Validation**: Config changes require updating schemas in `@codifycli/schemas` package
3. **Plugin IPC**: Plugins cannot directly read stdin (security isolation)
4. **Sudo Caching**: Password cached in memory during session unless `--secure` flag used
5. **File Watcher**: Use `persistent: false` option to prevent hanging processes
6. **Linting**: ESLint (`eslint.config.js`, flat config based on `eslint-config-oclif` v7) enforces single quotes, specific import ordering, and strict type safety. Formatting rules live under `@stylistic/` (ex: `@stylistic/quotes`)
7. **Reporter display methods are async**: All `Reporter` interface display methods (`displayPlan`, `displayImportResult`, `displayFileModifications`, `displayMessage`, `displayPluginError`) return `Promise<void>`. Always `await` them at call sites — `DefaultReporter.updateRenderState()` has a 50ms sleep, so unawaited calls cause `process.exit(1)` to fire before the UI renders.
8. **Mock reporter async assertions**: Assertions inside `MockReporter` config callbacks (e.g. `displayFileModifications`) will silently pass if the call isn't awaited. Making display methods async surfaced latent bugs where expected file paths were wrong.

## Template Resource Architecture

`{ "type": "template", "source": "nvm" | "@profile/name" | "<dashboard document uuid>" }` is a core config block (like `project`). It lives in the CLI, is never sent to a plugin, and is replaced by the resources of the template.

**Flow** (only for `plan`, `apply` and `destroy`: `PluginInitOrchestrator` with `expandTemplates: true`):
```
Parse → TemplateExpander.expand() → PluginManager.initialize() → os/distro filters
      → TemplateResourceMerger.merge() → validate → resolve dependencies
      → TemplateCommandApproval.ensureApproved() → plan → apply
```

- **`src/entities/template-config.ts`**: `TemplateConfig` (`ConfigType.TEMPLATE`), validated against `TemplateSchema` from `@codifycli/schemas`. `Project.templateConfigs` holds the declarations and `Project.declarations` keeps the declaration order.
- **`src/templates/template-loader.ts`**: `ApiTemplateLoader` loads registry templates (`DashboardApiClient.getTemplate`, no login) or dashboard documents (uuid, login required). `version` is in the schema but not supported by the registry yet (throws). Local files are intentionally not supported.
- **`src/templates/template-expander.ts`**: expands templates recursively, in place. Templates can't declare plugins. Each resource records `origins` (the template chains it was included through). Cycles are skipped; a template included twice is added once and gains an extra origin.
- **Template constraints**: `dependsOn` on a template declaration is stored in `ResourceConfig.inheritedDependsOn` (never written to files or sent to plugins). `os`/`distro` on a template are applied through `origins` in the Project filters. `dependsOn: ["template.<name>"]` / `"template"` / `"<name>"` resolve to the resources of that template.
- **`src/templates/template-resource-merger.ts`**: after plugin init, template resources that the owning plugin `match`es with an earlier resource are merged into it (project resources win, then earlier templates). Arrays are combined, objects merged, scalar conflicts keep the winner and become `Plan.warnings`. Unmatched unnamed duplicates get numeric names in declaration order.
- **Ordering**: `DependencyGraphResolver` is a stable Kahn sort (declaration order unless a dependency requires a move), so template resources stay at the template's position.
- **`src/templates/template-command-approval.ts`**: `action` resources only declared in templates must be approved before planning (the `condition` runs during the plan). Approvals are stored in `~/.codify/approved-template-commands.json` keyed by a hash of the template sources and the full config. Declining throws `TemplateCommandsDeclinedError` (whole run stops). `-y` does not approve them; `--auto-approve-all` / `-yy` does. `Reporter.promptTemplateCommandApproval` must never auto approve (Json reporter throws, Stub declines).
- `codify apply <template>` is a project with a single template declaration (the resolver's fetched template is seeded into the loader).
- `import`/`refresh`/`edit` do not expand templates: template blocks are left untouched in files.

## Variables and Conditions Architecture

`{ "type": "variable", "name": "siteType", "valueType": "enum", "options": [...], "default"?, "description"?, "sensitive"?, "when"? }` is a core config block (`ConfigType.VARIABLE`, `src/entities/variable-config.ts`, validated against `VariableSchema`). It is never sent to a plugin. `valueType` is `text` (default), `number`, `boolean`, `enum` or `multiEnum`. Values are asked on every run and never saved.

- **References**: `${{ name }}` in resource parameters, in variable defaults and in the `variables` passed to templates (`src/variables/substitution.ts`). A string that is exactly one reference gets the typed value (number, boolean, list); otherwise the value is interpolated as text. `$${{ name }}` is an escaped literal. Not allowed in `template.source`. A reference without a variable block is an implicit `text` variable: it is asked as well and shown as a plan warning (`Project.implicitVariables`).
- **Conditions** (`when` on resources, templates and variables, `src/variables/condition.ts`): keys are variable names and must all match. A value means equals (multiEnum: includes), a list means one of, `{ "not": ... }` the opposite, `any` is a list of alternatives. A variable without a value (its own `when` didn't match) never matches. Conditions may only reference declared variables (`VariableError` otherwise). `os`/`distro` stay separate fields.
- **`VariableResolver.resolveScope()`** (`src/variables/variable-resolver.ts`) handles one file: validates, orders the variables (stable sort on `when`/`default` dependencies, cycles are errors), asks for each one (`Reporter.promptVariable`, asked again with `error` until valid), removes declarations whose `when` doesn't match, asks for implicit variables, then replaces the references (`ResourceConfig.setParameter`, `TemplateConfig.resolvedVariables`). Parameters that use a `sensitive` variable go into `ResourceConfig.sensitiveParameterKeys` and are masked in the plan.
- **Scopes**: variables are scoped to their file. `TemplateExpander.flatten()` resolves a file's scope before expanding its templates, so the questions come in rounds and templates whose `when` doesn't match are never loaded. A template's scope is labelled by its declaration name or the last part of its source (`astro-blog`, repeated labels get `-2`). Qualified names (`astro-blog.projectName`) are used by `--var` and in prompts. A template included again with different `resolvedVariables` is expanded again (`instanceKey`).
- **Values instead of asking**: values passed by the template declaration > `--var name=value` / `--var template.name=value` (`src/common/variable-flags.ts`) > the values file (`CODIFY_PARAMETER_VALUES_FILE`, now `{ parameters, variables }`, the old list format is still read). `codify test` expands templates on the host and forwards every value to the VM. `codify connect` writes the `variables` of the request body to the values file (`src/connect/variable-values.ts`), never on the command line or in logs. `GET /capabilities` tells the dashboard that the CLI supports variables.
- **Pipeline**: `PluginInitOrchestrator` resolves variables right after parsing, before plugin initialization: `expandTemplates` (plan, apply, destroy, test) uses the expander, `resolveVariables` (import, refresh) uses `TemplateExpander.resolveProjectVariables()` for the project file only. Resources removed by a condition prune `dependsOn` like the os filter (`Project.removeConditionalDeclarations`).
- **Import / refresh write-back**: refresh imports only the resources whose `when` matches, with their values. `ImportOrchestrator.updateExistingFiles` passes the resolved project to `FileModificationCalculator` for its own file, so matching uses values while the file is written from its contents: `${{ }}` references and core properties (`name`, `dependsOn`, `os`, `distro`, `when`) are kept (`src/generators/preserve-existing-values.ts`). Block positions are counted from the file, so variable blocks count.
- `validate` and `init` do not resolve variables.

## Plugin Error Handling Architecture

Plugin errors flow as structured `PluginErrorData` over IPC and are caught as `PluginError` instances on the CLI side:

**IPC envelope** (`@codifycli/schemas`):
```typescript
interface PluginErrorData {
  errorType: string;   // 'apply_validation' | 'sudo_error' | 'unknown'
  message: string;
  data?: unknown;
}
```

**CLI carrier** (`src/common/errors.ts`): `PluginError extends CodifyError` holds `pluginName`, `resourceType`, and `errorData: PluginErrorData`.

**Reporter as view model**: Reporters (not components) decide how to render each `errorType`. `DefaultReporter.displayPluginError()` branches on `errorType` to set the appropriate `RenderStatus` (`APPLY_VALIDATION_ERROR` with a `ResourcePlan` for plan diffs, `PLUGIN_ERROR` with a message string for generic errors). The `DefaultComponent` is purely display.

**Shared formatter**: `src/ui/plugin-error-formatter.ts` exports `formatApplyValidationError(error: PluginError): string` used by both `PlainReporter` and `DefaultComponent`.

**Backward compat**: `plugin.ts#toErrorData()` validates IPC data against `ErrorResponseDataSchema` (AJV); falls back to `{ errorType: 'unknown', message: data }` for old plugins sending bare strings.