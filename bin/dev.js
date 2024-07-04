#!/usr/bin/env tsx --no-warnings=ExperimentalWarning

import oclif from '@oclif/core'

oclif.settings.performanceEnabled = true;
await oclif.execute({ development: true, dir: import.meta.url })
