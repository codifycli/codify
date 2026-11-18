// npm-publish prep. Runs from `prepublishOnly` (after `npm run build`).
//
// The plain `tsc` build doesn't handle the README: npm should show a "migrated and
// re-purposed" blurb that the git-tracked README must NOT carry. README.npm.md holds
// ONLY the blurb; we back up the real README and prepend the blurb to it (so the body
// is never duplicated). `npm run restore-npm` (via postpublish, and defensively on
// failure) restores it from the backup.
//
// The backup file (README.md.orig) is the single source of truth for restoration,
// so a failed publish never leaves README.md dirty.

import chalk from 'chalk'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'

const README = 'README.md'
const README_BLURB = 'README.npm.md'
// The transient backup is intentionally NOT named README* and is a dotfile — npm
// force-includes any README* file into the tarball regardless of the `files`
// allowlist, and this backup is just build scratch that shouldn't ship.
const README_BACKUP = '.npm-readme-backup.md'

// ── Prepend the npm blurb to README.md ────────────────────────────────────
// README.npm.md holds ONLY the blurb; we prepend it to the real README so the
// body never has to be duplicated/kept in sync. `npm run restore-npm` puts the
// original README.md back from the backup.
if (!existsSync(README_BLURB)) {
  console.error(chalk.red(`ERROR: ${README_BLURB} not found. Cannot build npm README.`))
  process.exit(1)
}

// If a stale backup exists (previous publish aborted before restore), the real
// README was already saved there — use it as the base so we don't prepend twice.
if (!existsSync(README_BACKUP)) {
  console.log(chalk.magenta(`Backing up ${README} → ${README_BACKUP}`))
  await fs.copyFile(README, README_BACKUP)
} else {
  console.log(chalk.yellow(`${README_BACKUP} already exists (stale?); using it as the base`))
}

console.log(chalk.magenta(`Prepending ${README_BLURB} to ${README}`))
const blurb = await fs.readFile(README_BLURB, 'utf8')
const body = await fs.readFile(README_BACKUP, 'utf8')
await fs.writeFile(README, `${blurb.trimEnd()}\n\n${body}`, 'utf8')
