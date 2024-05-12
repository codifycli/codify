#!/usr/bin/env node

// This removes any Node Experimental warnings from being printed to the CLI
process.removeAllListeners('warning')

import { flush, handle, run } from '@oclif/core'

await run(process.argv.slice(2), import.meta.url)
  .catch(async (error) => handle(error))
  .finally(async () => flush())
