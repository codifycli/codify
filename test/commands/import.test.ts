import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('import', () => {
  it('runs import cmd', async () => {
    const {stdout} = await runCommand('import')
    expect(stdout).to.contain('hello world')
  })

  it('runs import --name oclif', async () => {
    const {stdout} = await runCommand('import --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
