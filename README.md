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
$ codify (--version|-v)
codify/1.0.0 darwin-arm64 node-v22.19.0
$ codify --help [COMMAND]
USAGE
  $ codify COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- handlers -->
* [`codify apply`](#codify-apply)
* [`codify destroy`](#codify-destroy)
* [`codify help [COMMAND]`](#codify-help-command)
* [`codify import`](#codify-import)
* [`codify init`](#codify-init)
* [`codify plan`](#codify-plan)
* [`codify update [CHANNEL]`](#codify-update-channel)
* [`codify validate`](#codify-validate)

## `codify apply`

Install or update resources on the system based on a codify.jsonc file.

```
USAGE
  $ codify apply [--debug] [-o plain|default|json] [-p <value>] [-S <value>]

FLAGS
  -S, --sudoPassword=<value>  Automatically use this password for any commands that require elevated permissions.
  -o, --output=<option>       [default: default] Control the output format.
                              <options: plain|default|json>
  -p, --path=<value>          Path to run Codify from.
      --debug                 Print additional debug logs.

DESCRIPTION
  Install or update resources on the system based on a codify.jsonc file.

  Codify first generates a plan to determine the necessary execution steps. See
  codify plan --help  for more details.
  The execution plan will be presented and approval will be asked before Codify applies
  any changes.

  For scripts: use  --output json  which will skip approval and
  apply changes directly.

  For more information, visit: https://docs.codifycli.com/commands/apply


EXAMPLES
  $ codify apply

  $ codify apply --path ~

  $ codify apply -o json

  $ codify apply -S <sudo password>
```

_See code: [src/commands/apply.ts](https://github.com/kevinwang5658/codify/blob/v0.9.0/src/commands/apply.ts)_

## `codify destroy`

Use Codify to uninstall a supported package or setting on the system.

```
USAGE
  $ codify destroy [--debug] [-o plain|default|json] [-p <value>] [-S <password>]

FLAGS
  -S, --sudoPassword=<password>  Automatically use this password for any commands that require elevated permissions.
  -o, --output=<option>          [default: default] Control the output format.
                                 <options: plain|default|json>
  -p, --path=<value>             Path to run Codify from.
      --debug                    Print additional debug logs.

DESCRIPTION
  Use Codify to uninstall a supported package or setting on the system.

  This command will only work for resources with Codify support. This command
  can work with or without a codify.jsonc file.

  Modes:
  • If a codify.jsonc file exists, destroy the resource specified in the Codify.jsonc file
  with a matching type.
  • If a codify.jsonc file doesn't exist, additional information may be asked to identify
  the specific resource to destroy.

  For more information, visit: https://docs.codifycli.com/commands/destory

EXAMPLES
  $ codify destroy homebrew nvm

  $ codify destroy homebrew nvm --path=~

  $ codify destroy
```

_See code: [src/commands/destroy.ts](https://github.com/kevinwang5658/codify/blob/v0.9.0/src/commands/destroy.ts)_

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

Generate Codify configurations from already installed packages. 

```
USAGE
  $ codify import [--debug] [-o plain|default|json] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default] Control the output format.
                         <options: plain|default|json>
  -p, --path=<value>     Path to run Codify from.
      --debug            Print additional debug logs.

DESCRIPTION
  Generate Codify configurations from already installed packages.

  Use a space-separated list of arguments to specify the resource types to import.
  If a codify.jsonc file already exists, omit arguments to update the file to match the system.

  Modes:
  1. No args: If no args are specified and an *.codify.jsonc already exists, Codify
  will update the existing file with new changes on the system.

  Command:
  codify import

  2. With args: Specify specific resources to import using arguments. Wild card matching is supported
  using '*' and '?' (Note: in zsh * expands to the current dir and needs to be escaped using \* or '*').
  A prompt will be shown if more information is required to complete the import.

  Examples:
  codify import nvm asdf*
  codify import \* (for importing all supported resources)

  The results can be saved in one of three ways:
  a. To an existing *.codify.jsonc file
  b. To a new file
  c. Printed to the console only

  Codify will attempt to smartly insert new configurations while preserving existing spacing and formatting.

  For more information, visit: https://docs.codifycli.com/commands/import

EXAMPLES
  $ codify import homebrew nvm asdf

  $ codify import

  $ codify import git-clone --path ../my/other/folder

  $ codify import \*
```

_See code: [src/commands/import.ts](https://github.com/kevinwang5658/codify/blob/v0.9.0/src/commands/import.ts)_

## `codify init`

A helper to quickly get started with Codify.

```
USAGE
  $ codify init [--debug] [-o plain|default|json]

FLAGS
  -o, --output=<option>  [default: default] Control the output format.
                         <options: plain|default|json>
      --debug            Print additional debug logs.

DESCRIPTION
  A helper to quickly get started with Codify.

  Use this command to automatically generate Codify configs based on
  the currently installed system resources. By default, the new file
  will be written to  ~/codify.jsonc .

  For more information, visit: https://docs.codifycli.com/commands/init

EXAMPLES
  $ codify init
```

_See code: [src/commands/init.ts](https://github.com/kevinwang5658/codify/blob/v0.9.0/src/commands/init.ts)_

## `codify plan`

Generate an execution plan to apply changes from a codify.jsonc file.

```
USAGE
  $ codify plan [--debug] [-o plain|default|json] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default] Control the output format.
                         <options: plain|default|json>
  -p, --path=<value>     Path to run Codify from.
      --debug            Print additional debug logs.

DESCRIPTION
  Generate an execution plan to apply changes from a codify.jsonc file.

  This plan lists all the changes Codify needs to make to apply the codify.jsonc file.
  The plan will not be executed. Behind the scenes, Codify performs a refresh scan to
  determine the current configuration and installed resources, then compares them with
  the desired configuration to compute the execution plan.

  For scripts: use  --output json  which will skip all prompts and print
  only the final result as a json.

  For more information, visit: https://docs.codifycli.com/commands/plan

EXAMPLES
  $ codify plan

  $ codify plan -o json

  $ codify plan -p ../
```

_See code: [src/commands/plan.ts](https://github.com/kevinwang5658/codify/blob/v0.9.0/src/commands/plan.ts)_

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

## `codify validate`

Validate a codify.jsonc/codify.json/codify.yaml file.

```
USAGE
  $ codify validate [--debug] [-o plain|default|json] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default] Control the output format.
                         <options: plain|default|json>
  -p, --path=<value>     Path to run Codify from.
      --debug            Print additional debug logs.

DESCRIPTION
  Validate a codify.jsonc/codify.json/codify.yaml file.

  For more information, visit: https://docs.codifycli.com/commands/validate


EXAMPLES
  $ codify validate

  $ codify validate --path=../../import.codify.jsonc
```

_See code: [src/commands/validate.ts](https://github.com/kevinwang5658/codify/blob/v0.9.0/src/commands/validate.ts)_
<!-- commandsstop -->
