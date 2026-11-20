#!/usr/bin/env node

import module from 'node:module'

// Cache the compiled code of the CLI between runs (Node >= 22.1, in the OS temp dir). It must be enabled before the
// CLI is imported, so the imports below are dynamic.
module.enableCompileCache?.()

// This removes any Node Experimental warnings from being printed to the CLI
process.removeAllListeners('warning')

const { flush, handle, run } = await import('@oclif/core')

// `codify` with no arguments starts the agent chat (`codify prompt`)
const args = process.argv.slice(2)
await run(args.length === 0 ? ['prompt'] : args, import.meta.url)
  .catch(async (error) => handle(error))
  .finally(async () => flush())
