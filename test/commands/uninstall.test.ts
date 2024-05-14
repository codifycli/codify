import { expect, test } from '@oclif/test'

describe('uninstall', () => {
  test
    .stdout()
    .command(['uninstall'])
    .it('runs hello', ctx => {
      expect(ctx.stdout).to.contain('hello world')
    })

  test
    .stdout()
    .command(['uninstall', '--name', 'jeff'])
    .it('runs hello --name jeff', ctx => {
      expect(ctx.stdout).to.contain('hello jeff')
    })
})
