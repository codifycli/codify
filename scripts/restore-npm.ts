// Restores the git-tracked README.md after an npm publish.
//
// scripts/build-npm.ts swaps in README.npm.md and saves the real README to
// README.md.orig. This restores it from that backup and removes the backup.
// Runs via `postpublish` (success) and can be run manually if a publish aborts.
// Idempotent: a no-op if there's no backup to restore.

import chalk from 'chalk'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'

const README = 'README.md'
const README_BACKUP = '.npm-readme-backup.md'

if (existsSync(README_BACKUP)) {
  console.log(chalk.magenta(`Restoring ${README} from ${README_BACKUP}`))
  await fs.copyFile(README_BACKUP, README)
  await fs.rm(README_BACKUP)
} else {
  console.log(chalk.gray(`No ${README_BACKUP} to restore; nothing to do.`))
}
