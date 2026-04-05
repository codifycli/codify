# Codify - Your Development Environment as Code

**Stop manually setting up your development environment. Define it once, replicate it everywhere.**

Codify is a command-line tool that brings the power of Infrastructure as Code (IaC) to your local development machine. Manage system settings, install packages, configure tools, and automate your setup using a simple, declarative configuration file. It's like Terraform but for your local machine.

<p align="center">
  <a href="https://codifycli.com">Website</a> •
  <a href="https://dashboard.codifycli.com">Web Editor</a> •
  <a href="https://docs.codifycli.com">Documentation</a>
</p>

<p align="center">
  <a href="https://oclif.io"><img src="https://img.shields.io/badge/cli-oclif-brightgreen.svg" alt="oclif"></a>
  <a href="https://github.com/codifycli/codify/actions/workflows/run-unit-tests.yaml"><img src="https://github.com/codifycli/codify/actions/workflows/run-unit-tests.yaml/badge.svg" alt="Github Actions"></a>
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
</p>

---

## The Problem

Every developer has been there:
- **New machine?** Spend hours reinstalling and configuring everything
- **Team onboarding?** Send them a scattered wiki page of manual installation steps
- **Multiple machines?** Keep them in sync manually
- **Configuration drift?** Your laptop works differently than your colleague's

## The Solution

With Codify, your entire development environment is defined in a single `codify.jsonc` file:

```jsonc
[
  {
    "type": "homebrew",
    "formulae": ["git", "node"]
  },
  {
    "type": "vscode"
  },
  {
    "type": "docker"
  }
]
```

Now you can:
- **See what changes** before applying them with `codify plan`
- **Apply changes** automatically with `codify apply`
- **Version control** your environment setup
- **Share configurations** with your team
- **Replicate setups** across multiple machines in minutes

## Key Features

### **Declarative Configuration**
Define your entire development environment in a single, readable configuration file. No more shell scripts or scattered installation instructions.

### **Plan Before You Apply**
Like Terraform, Codify shows you exactly what changes will be made before executing them.

```bash
$ codify plan
...
╭───────────────────────────────────────╮
│Codify Plan                            │
╰───────────────────────────────────────╯
The following actions will be performed:

 + vscode will be created
  {
      "directory": "/Applications"
  }

 + nvm will be created
  {
      "nodeVersions": [
          "20"
      ],
      "global": "20"
  }

Do you want to apply the above changes?
❯ Yes
  No
```

### **Import Your Current Setup**
Already have a configured machine? Generate a Codify configuration from your existing setup:

```bash
$ codify init
...
Codify found the following supported resorces on your system.

 Select the resources to import:
❯ ◉ asdf
  ◉ aws-cli
  ◉ docker
  ◉ git
  ◉ git-lfs
  ◉ git-repository
  ◉ homebrew
  ◉ jenv
  ◉ macports
Use <space> to select and <return> to submit.
Use <a> to select all items and <d> to de-select all items.
```

### **Extensible Plugin System**
Out-of-the-box support for:
- **Homebrew** (formulae and casks)
- **VS Code** (extensions and settings)
- **npm** global packages
- **macOS** system preferences
- **Git** configuration
- And [many more](https://docs.codifycli.com/plugins)...

Don't see what you need? [Create your own plugin](https://codifycli.com/docs/plugins).

### **Web-Based Editor**
Edit your configuration in a web interface at [dashboard.codifycli.com](https://dashboard.codifycli.com):
- Intuitive UI with auto-completion
- Real-time validation
- Cloud sync across devices
- Share configurations with your team

### **Safe & Secure**
- Preview all changes before applying
- Both the CLI tool and default plugin are open source and Apache 2.0 licensed
- Requests your password each time elevated privileges (sudo) is required.

## Quick Start

### Installation

**macOS / Linux:**
```bash
/bin/bash -c "$(curl -fsSL https://releases.codifycli.com/install.sh)"
```

### Your First Codify Project

**Option 1: Import your existing setup**
```bash
# Scan your system and generate a configuration
codify init

# Review the generated codify.jsonc file
cat codify.jsonc

# Make changes and apply them
codify apply
```

**Option 2: Start from scratch**
```bash
# Create a new configuration file
cat > codify.jsonc << EOF
[
  {
    "type": "homebrew",
    "formulae": ["git", "node"]
  }
]
EOF

# Preview changes
codify plan

# Apply changes
codify apply
```

## Common Commands

| Command             | Description                                                    |
|---------------------|----------------------------------------------------------------|
| `codify init`       | Scan your system and generate a configuration file            | 
| `codify plan`       | Preview what changes will be made                              |
| `codify apply`      | Apply the configuration to your system                         |
| `codify import`     | Add existing resources to your configuration                   |
| `codify validate`   | Check your configuration file for errors                       |
| `codify destroy`    | Remove resources managed by Codify                             |
| `codify connect`    | Connect CLI to the web dashboard for cloud sync                |
| `codify test`       | Test your configuration in an isolated VM                      |

Run `codify --help` for a complete list of commands and options.

## Example Configurations

### Full-Stack JavaScript Developer
```json
[
  {
    "type": "homebrew",
    "formulae": ["postgresql@18", "redis"]
  },
  {
    "type": "nvm",
    "nodeVersions": ["20.0.0", "18.0.0"],
    "global": "20.0.0"
  },
  {
    "type": "git-repository",
    "parentDirectory": "~/projects",
    "repositories": [
      "git@github.com:myorg/frontend.git",
      "git@github.com:myorg/backend.git"
    ]
  },
  {
    "type": "vscode"
  },
  {
    "type": "docker"
  }
]
```

### Python Data Science Environment

```json
[
  {
    "type": "pyenv",
    "pythonVersions": ["3.11.0", "3.10.0"],
    "global": "3.11.0"
  },
  {
    "type": "pip",
    "install": ["pandas", "numpy", "matplotlib", "scikit-learn"]
  }
  {
    "type": "venv-project",
    "envDir": ".venv",
    "cwd": "~/data-science",
    "automaticallyInstallRequirementsTxt": true
  }
]
```

### DevOps Toolkit
```json
[
  {
    "type": "homebrew",
    "formulae": ["kubernetes-cli", "helm"]
  },
  { "type": "aws-cli" },
  {
    "type": "aws-profile",
    "profile": "production",
    "awsAccessKeyId": "AKIA...",
    "awsSecretAccessKey": "TOP_SECRET"
  },
  {
    "type": "docker"
  },
  {
    "type": "ssh-key",
    "passphrase": ""
  },
  {
    "type": "terraform"
  }
]
```

## Frequently Asked Questions

**Q: Does Codify work on Linux and Windows?**
A: Codify currently supports macOS and Linux. Windows support works via WSL.

**Q: How is this different from Ansible/Chef/Puppet?**
A: Those tools are designed for server configuration management. Codify is purpose-built for local development environments with a focus on simplicity and developer experience.

## Community & Support

- **Documentation**: [docs.codifycli.com](https://docs.codifycli.com)
- **Issues**: [GitHub Issues](https://github.com/codifycli/codify/issues)
- **Default Plugin**: [GitHub Default Plugin](https://github.com/codifycli/default-plugin)
- **Website**: [codifycli.com](https://codifycli.com)
- **Editor**: [dashboard.codifycli.com](https://dashboard.codifycli.com)

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the [Apache 2.0 License](LICENSE).

---

<p align="center">
  Made with ❤️ by developers, for developers
</p>

<p align="center">
  <a href="https://codifycli.com">codifycli.com</a> •
  <a href="https://github.com/codifycli/codify">GitHub</a> •
  <a href="https://docs.codifycli.com">Docs</a>
</p>
