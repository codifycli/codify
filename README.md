# Codify - Your Development Environment as Code

**Stop manually setting up your development environment. Define it once, replicate it everywhere.**

Codify is a command-line tool that brings the power of Infrastructure as Code (IaC) to your local development machine. Manage system settings, install packages, configure tools, and automate your entire setup using a simple, declarative configuration file—just like you manage your infrastructure with Terraform.

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
- **What's installed?** No clear record of your development environment
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
- ✅ **See what changes** before applying them with `codify plan`
- ✅ **Apply changes** automatically with `codify apply`
- ✅ **Version control** your environment setup
- ✅ **Share configurations** with your team
- ✅ **Replicate setups** across multiple machines in minutes

## Key Features

### 🎯 **Declarative Configuration**
Define your entire development environment in a single, readable configuration file. No more shell scripts or scattered installation instructions.

### 🔍 **Plan Before You Apply**
Like Terraform, Codify shows you exactly what changes will be made before executing them. No surprises.

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

### 📥 **Import Your Current Setup**
Already have a configured machine? Generate a Codify configuration from your existing setup in seconds:

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

### 🔌 **Extensible Plugin System**
Out-of-the-box support for:
- **Homebrew** (formulae and casks)
- **VS Code** (extensions and settings)
- **npm** global packages
- **macOS** system preferences
- **Git** configuration
- And [many more](https://docs.codifycli.com/plugins)...

Don't see what you need? Create your own plugin in minutes.

### 🌐 **Web-Based Editor**
Edit your configuration in a beautiful web interface at [dashboard.codifycli.com](https://dashboard.codifycli.com):
- 🎨 Intuitive UI with auto-completion
- 🔄 Real-time validation
- ☁️ Cloud sync across devices
- 🤝 Share configurations with your team

### 🔒 **Safe & Secure**
- Preview all changes before applying
- Sudo password prompts only when needed
- Secure mode for extra protection
- Open source and Apache 2.0 licensed

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

### Pro Tip: Use the Web Editor

Visit [dashboard.codifycli.com](https://dashboard.codifycli.com) for a guided, visual way to build your configuration with:
- Auto-complete for all available packages
- Real-time validation
- Cloud storage and sync
- Shareable configurations

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

## Real-World Use Cases

### **Individual Developers**
- Keep multiple machines (work laptop, personal laptop, desktop) in sync
- Quickly recover from system reinstalls or upgrades
- Document your development environment as code
- Try out new tools without the hassle of installing them

### **Development Teams**
- Onboard new developers in minutes instead of days
- Ensure everyone has the same development environment
- Share team configurations via Git or the [Codify editor](https://dashboard.codifycli.com)
- Reduce "works on my machine" problems

### **Organizations**
- Standardize development environments across teams
- Maintain compliance with required tools and versions
- Reduce IT support burden for developer setup
- Break down barriers between teams and departments

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

## Why Codify vs. Alternatives?

| Feature                          | Codify | Homebrew Bundle | Shell Scripts | Manual Setup |
|----------------------------------|:------:|:---------------:|:-------------:|:------------:|
| Declarative configuration        | ✅      | ✅               | ❌            | ❌           |
| Plan before apply                | ✅      | ❌               | ❌            | ❌           |
| Import existing setup            | ✅      | ❌               | ❌            | ❌           |
| Multi-format support             | ✅      | ❌               | ❌            | ❌           |
| Web-based editor                 | ✅      | ❌               | ❌            | ❌           |
| Cross-tool management            | ✅      | ❌               | ⚠️            | ❌           |
| Extensible plugins               | ✅      | ❌               | ⚠️            | ❌           |
| Cloud sync                       | ✅      | ❌               | ❌            | ❌           |
| Update detection                 | ✅      | ✅               | ❌            | ❌           |

## Frequently Asked Questions

**Q: Does Codify work on Linux and Windows?**
A: Codify currently supports macOS and Linux. Windows support works via WSL.

**Q: Can I use Codify with my existing Homebrew setup?**
A: Yes! Run `codify init` to import your existing packages into a Codify configuration.

**Q: Is my sudo password stored?**
A: No. Codify only caches your password in memory during a session and prompts when needed. Use `--secure` mode for extra protection.

**Q: How is this different from Ansible/Chef/Puppet?**
A: Those tools are designed for server configuration management. Codify is purpose-built for local development environments with a focus on simplicity and developer experience.

## Community & Support

- 📚 **Documentation**: [docs.codifycli.com](https://docs.codifycli.com)
- 🐛 **Issues**: [GitHub Issues](https://github.com/codifycli/codify/issues)
- 💬 **Default Plugin**: [GitHub Default Plugin](https://github.com/codifycli/default-plugin)
- 🌐 **Website**: [codifycli.com](https://codifycli.com)
- ☁️ **Editor**: [dashboard.codifycli.com](https://dashboard.codifycli.com)

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
