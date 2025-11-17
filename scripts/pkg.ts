import chalk from 'chalk'
import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path';

// Create .build folder if it does not exist
try {
  await fs.mkdir('./.build')
} catch (err) {}

console.log(chalk.magenta('Removing everything in ./.build except tmp'))
await fs.readdir('./.build')
  .then((files) =>
    Promise.all(
      files.map(file => file === 'tmp'
        ? undefined
        : fs.rm(`./.build/${file}`, { recursive: true })
      )
    )
  );

console.log(chalk.magenta('Copying files to ./.build'))
await Promise.all([
  fs.cp('package.json', './.build/package.json'),
  fs.cp('package-lock.json', './.build/package-lock.json'),
  fs.cp('./bin', './.build/bin/', { recursive: true }),
  fs.cp('README.md', './.build/README.md'),
]);

console.log(chalk.magenta('Esbuild src'))
execSync('tsx esbuild.ts', { shell: 'zsh' })

console.log(chalk.magenta('Install production dependencies'))
execSync('npm install --production', { cwd: './.build', shell: 'zsh' })

console.log(chalk.magenta('Running oclif pkg macos'))
execSync('oclif pack macos -r .', { cwd: './.build', shell: 'zsh' });
await patchMacOsInstallers()

console.log(chalk.magenta('Running oclif pkg tarballs'))
execSync('oclif pack tarballs -r . -t darwin-arm64,darwin-x64', { cwd: './.build', shell: 'zsh' })

console.log(chalk.magenta('Copying files back'))
await Promise.all([
  ignoreError(() => fs.rename('./.build/README.md', './README.md')),
]);

async function ignoreError(fn: () => Promise<any> | any): Promise<void> {
  try {
    await fn();
  } catch (e) {
  }
}

// Oclif has a bug where the installer doesn't clear out the auto-updater location. This causes older versions
// to be re-used even with a clean install
async function patchMacOsInstallers() {
  console.log(chalk.magenta('Patching MacOS installers with bug fix'))

  const pkgFolder = './.build/dist/macos';
  const files = await fs.readdir(pkgFolder)
  const pkgFiles = files.filter((name) => name.endsWith('.pkg'))

  for (const pkgFile of pkgFiles) {
    const pkgPath = path.join(pkgFolder, pkgFile);
    const tmpPath = path.join(pkgFolder, 'tmp');

    execSync(`pkgutil --expand ${pkgPath} ${tmpPath}`)
    await fs.appendFile(path.join(tmpPath, 'Scripts', 'preinstall'), '\nsudo rm -rf ~/.local/share/codify', 'utf8');
    execSync(`pkgutil --flatten ${tmpPath} ${pkgPath} `)
    execSync(`rm -rf ${tmpPath}`);
    console.log(chalk.magenta(`Done patching installer ${pkgFile}`))
  }
}
