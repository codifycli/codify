# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Codify is a configuration-as-code CLI tool that brings Infrastructure-as-Code principles to local development environments. It allows developers to declaratively define their development setup (packages, tools, system settings) in configuration files and apply them in a reproducible way. Think "Terraform for your local machine."

## Development Commands

### Building
```bash
npm run build              # Build TypeScript to dist/
npm run lint               # Type-check with tsc
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
6. **Linting**: ESLint enforces single quotes, specific import ordering, and strict type safety