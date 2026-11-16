#!/usr/bin/env tsx --no-warnings=ExperimentalWarning

import oclif from '@oclif/core'

oclif.settings.performanceEnabled = true;
// `codify` with no arguments starts the agent chat (`codify prompt`)
const args = process.argv.slice(2)
await oclif.execute({ development: true, dir: import.meta.url, args: args.length === 0 ? ['prompt'] : args })
