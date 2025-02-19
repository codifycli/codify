oclif-hello-world
=================

oclif example Hello World CLI

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![CircleCI](https://circleci.com/gh/oclif/hello-world/tree/main.svg?style=shield)](https://circleci.com/gh/oclif/hello-world/tree/main)
[![GitHub license](https://img.shields.io/github/license/oclif/hello-world)](https://github.com/oclif/hello-world/blob/main/LICENSE)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g codify
$ codify COMMAND
running command...
$ codify (--version)
codify/0.6.0 darwin-arm64 node-v20.15.1
$ codify --help [COMMAND]
USAGE
  $ codify COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`codify apply`](#codify-apply)
* [`codify destroy`](#codify-destroy)
* [`codify help [COMMAND]`](#codify-help-command)
* [`codify import`](#codify-import)
* [`codify plan`](#codify-plan)
* [`codify update [CHANNEL]`](#codify-update-channel)

## `codify apply`

Apply a codify file onto the system. A plan of the changes is first generated and a list of changes will be shown before proceeding

```
USAGE
  $ codify apply [--json] [--debug] [-o plain|default|debug|json] [-s] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -p, --path=<value>     Path to codify.json file
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Apply a codify file onto the system. A plan of the changes is first generated and a list of changes will be shown
  before proceeding

EXAMPLES
  $ codify apply

  $ codify apply --path ~
```

_See code: [src/commands/apply/index.ts](https://github.com/kevinwang5658/codify/blob/v0.6.0/src/commands/apply/index.ts)_

## `codify destroy`

Destroy or uninstall a resource (or many resources).

```
USAGE
  $ codify destroy [--json] [--debug] [-o plain|default|debug|json] [-s] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -p, --path=<value>     Path to codify.json file
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Destroy or uninstall a resource (or many resources).

EXAMPLES
  $ codify destroy homebrew nvm
```

_See code: [src/commands/destroy.ts](https://github.com/kevinwang5658/codify/blob/v0.6.0/src/commands/destroy.ts)_

## `codify help [COMMAND]`

Display help for codify.

```
USAGE
  $ codify help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for codify.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.18/src/commands/help.ts)_

## `codify import`

Generate codify configs from already installed packages. Use a list of space separated arguments to specify the resource types to import. Leave blank to import all resource in an existing *.codify.json file.

```
USAGE
  $ codify import [--json] [--debug] [-o plain|default|debug|json] [-s] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -p, --path=<value>     Path to codify.json file
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Generate codify configs from already installed packages. Use a list of space separated arguments to specify the
  resource types to import. Leave blank to import all resource in an existing *.codify.json file.

  Modes:
  1. No args: if no args are specified and an *.codify.json already exists. Then codify will update the existing file
  with any new changes to the resources specified in the file/files.

  Command: codify import

  2. With args: specify specific resources to import using arguments. Wild card matching is supported using '*' and ?
  (Note: in zsh * expands to the current dir and needs to be escaped using \* or '*'). A prompt will be shown if more
  information is required to complete the import.

  Example: codify import nvm asdf\*, codify import \* (for importing all supported resources)

  The results can then be saved:
  a. To an existing *.codify.json file
  b. To a new file
  c. Or only printed to console

  Codify will try to smartly insert new configs by following existing spacing and formatting.


EXAMPLES
  $ codify import homebrew nvm asdf\*

  $ codify import

  $ codify import git-clone --path ../my/other/folder

  $ codify import \*
```

_See code: [src/commands/import.ts](https://github.com/kevinwang5658/codify/blob/v0.6.0/src/commands/import.ts)_

## `codify plan`

Generate a plan based on a codify.json file. This plan will list out the changes Codify will need to make in order to meet the desired config.

```
USAGE
  $ codify plan [--json] [--debug] [-o plain|default|debug|json] [-s] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -p, --path=<value>     Path to codify.json file
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Generate a plan based on a codify.json file. This plan will list out the changes Codify will need to make in order to
  meet the desired config.

EXAMPLES
  $ codify plan
```

_See code: [src/commands/plan/index.ts](https://github.com/kevinwang5658/codify/blob/v0.6.0/src/commands/plan/index.ts)_

## `codify update [CHANNEL]`

update the codify CLI

```
USAGE
  $ codify update [CHANNEL] [--force |  | [-a | -v <value> | -i]] [-b ]

FLAGS
  -a, --available        See available versions.
  -b, --verbose          Show more details about the available versions.
  -i, --interactive      Interactively select version to install. This is ignored if a channel is provided.
  -v, --version=<value>  Install a specific version.
      --force            Force a re-download of the requested version.

DESCRIPTION
  update the codify CLI

EXAMPLES
  Update to the stable channel:

    $ codify update stable

  Update to a specific version:

    $ codify update --version 1.0.0

  Interactively select version:

    $ codify update --interactive

  See available versions:

    $ codify update --available
```

_See code: [@oclif/plugin-update](https://github.com/oclif/plugin-update/blob/v4.6.13/src/commands/update.ts)_
<!-- commandsstop -->
