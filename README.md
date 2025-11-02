# Sparkle

A collaborative task and dependency tracking system that uses Git as its database.

## What is Sparkle?

Sparkle helps teams track work items and their dependencies using a directed acyclic graph (DAG). Items can depend on each other, forming complex dependency chains that prevent completion until prerequisites are met.

Perfect for:
- Managing project tasks with complex dependencies
- Tracking bugs and feature requests
- Planning implementation order
- Coordinating team work across multiple branches

## Key Features

- **Git-based storage** - No database server required, just Git
- **Real-time collaboration** - Multiple users see updates instantly via SSE
- **Dependency tracking** - Visual DAG prevents completing items with unmet dependencies
- **Web-based UI** - List view, tree view, and dependency inspector
- **Offline capable** - Work locally, sync when connected
- **Multi-user sync** - Automatic conflict resolution via Git merge

## Quick Start

### Installation

1. Add Sparkle to your project:
```bash
npm install --save-dev ./sparkle-1.0.286.tgz
```
(Replace version number with the current release)

2. Commit the package to your repository:
```bash
git add package.json package-lock.json sparkle-1.0.286.tgz
git commit -m "Add Sparkle dependency tracking"
git push
```

3. The postinstall script will automatically open your browser for configuration.

4. Configure your Sparkle instance:
   - Choose a Git branch name (e.g., `sparkle-data`)
   - Choose a directory name (e.g., `sparkle-data`)
   - Set fetch interval for team sync

That's it! Sparkle is ready to use.

### Basic Usage

```bash
# Open Sparkle in browser (starts daemon if needed)
npx sparkle browser

# View item details from command line
npx sparkle cat <itemId>

# View item with full dependency chains
npx sparkle inspect <itemId>

# Start daemon only (background)
npx sparkle-daemon

# Stop daemon
npx sparkle-halt
```

## Documentation

For complete documentation, see the [docs/](docs/) directory:

- **[Getting Started](docs/getting_started.md)** - Detailed installation and configuration
- **[Web UI Guide](docs/web_ui_guide.md)** - Using the web interface
- **[Developer API](docs/developer_api.md)** - Programmatic integration (JavaScript & HTTP)
- **[Git Architecture](docs/git_architecture.md)** - How Sparkle uses Git under the hood
- **[Uninstall Guide](docs/completely-remove-sparkle.md)** - Removing Sparkle completely

## How It Works

Sparkle stores all data as JSON files on a separate Git branch, isolated from your code. A git worktree keeps this data separate from your working directory. All operations commit immediately and sync automatically with your team.

For the technical deep-dive, see [Git Architecture Manual](docs/git_architecture.md).

## Team Collaboration

When a teammate clones your repository and runs `npm install`, Sparkle automatically:
1. Detects the existing configuration
2. Fetches the Sparkle data branch
3. Sets up their local worktree
4. Starts syncing with the team

Everyone sees the same items, updates propagate in real-time, and Git handles all synchronization.

## Standalone Usage

You can use Sparkle without a project:

```bash
# Create a bare repo
git init --bare ~/my-sparkle.git

# Clone it locally
git clone ~/my-sparkle.git ~/my-sparkle
cd ~/my-sparkle

# Initialize and install Sparkle (use current version number)
npm init -y
npm install --save-dev ./sparkle-1.0.286.tgz
git add package.json package-lock.json sparkle-1.0.286.tgz
git commit -m "Initial Sparkle setup"
git push

# Start using Sparkle
npx sparkle browser
```

Your data is stored in the bare repo and can be backed up or shared like any Git repository.

## Development

Sparkle is built entirely with AI assistance - no human-written code. All implementation was done through AI pair programming.

### Contributing

Contributions welcome! Please:
- Use patch versions for bug fixes and small features
- Avoid major/minor version bumps in pull requests
- See [docs/sparkle-in-sparkle.md](docs/sparkle-in-sparkle.md) for development setup

### Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run all tests
npm run test:all
```

### Building

```bash
# Create a release (increments patch version)
npm run release

# Create distribution package only
npm run pack
```

## License

MIT License - Copyright 2025 Limitless Knowledge Association

Use freely, modify as needed, and steal any ideas you find interesting. The git worktree architecture is particularly powerful for multi-agent workflows.

## Why "Sparkle"?

The name comes from the "Deadly Diamond of Death" pattern in C++ multiple inheritance. Sparkle's DAG allows diamond-shaped dependency graphs - items can both **need** things and **support** things, just like the diamond pattern.
