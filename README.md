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
codify/0.3.1 darwin-arm64 node-v20.15.0
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
* [`codify import`](#codify-import)
* [`codify plan`](#codify-plan)

## `codify apply`

Apply a codify.json file. Codify apply will first generate a plan of the changes needed to meet the desired config in the codify.json file. The user will have the option to then apply the plan.

```
USAGE
  $ codify apply [--json] [--debug] [-o plain|default|debug|json] [-s] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -p, --path=<value>     path to project
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Apply a codify.json file. Codify apply will first generate a plan of the changes needed to meet the desired config in
  the codify.json file. The user will have the option to then apply the plan.

EXAMPLES
  $ codify apply
```

_See code: [src/commands/apply/index.js](https://github.com/kevinwang5658/codify/blob/v0.3.1/src/commands/apply/index.js)_

## `codify destroy`

Destroy or uninstall a resource (or many resources).

```
USAGE
  $ codify destroy [--json] [--debug] [-o plain|default|debug|json] [-s]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Destroy or uninstall a resource (or many resources).

EXAMPLES
  $ codify destroy homebrew nvm
```

_See code: [src/commands/destroy.js](https://github.com/kevinwang5658/codify/blob/v0.3.1/src/commands/destroy.js)_

## `codify import`

Generate codify configs from existing installations

```
USAGE
  $ codify import [--json] [--debug] [-o plain|default|debug|json] [-s] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -p, --path=<value>     path to project
  -s, --secure
  --debug

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Generate codify configs from existing installations

EXAMPLES
  $ codify import homebrew nvm
```

_See code: [src/commands/import.js](https://github.com/kevinwang5658/codify/blob/v0.3.1/src/commands/import.js)_

## `codify plan`

Generate a plan based on a codify.json file. This plan will list out the changes Codify will need to make in order to meet the desired config.

```
USAGE
  $ codify plan [--json] [--debug] [-o plain|default|debug|json] [-s] [-p <value>]

FLAGS
  -o, --output=<option>  [default: default]
                         <options: plain|default|debug|json>
  -p, --path=<value>     path to project
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

_See code: [src/commands/plan/index.js](https://github.com/kevinwang5658/codify/blob/v0.3.1/src/commands/plan/index.js)_
<!-- commandsstop -->
