#!/usr/bin/env node

// This removes any Node Experimental warnings from being printed to the CLI
process.removeAllListeners('warning')

import { flush, handle, run } from '@oclif/core'

// `codify` with no arguments starts the agent chat (`codify prompt`)
const args = process.argv.slice(2)
await run(args.length === 0 ? ['prompt'] : args, import.meta.url)
  .catch(async (error) => handle(error))
  .finally(async () => flush())
