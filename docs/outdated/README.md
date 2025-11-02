# Sparkle

Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.

Sparkle is a development tool for tracking bugs, tasks, and dependencies directly within your git repository. All items are stored in a dedicated git branch, enabling team collaboration through standard git workflows. Each item can have dependencies, status updates, and time-stamped entries, making it ideal for managing complex development projects where understanding task relationships is critical. The full API is available for programmatic access and extension - see [overview.md](overview.md) for complete details.

## Installation

### Step 1: Install Sparkle

Install Sparkle as a dev dependency in your project:

```bash
npm install --save-dev sparkle-<version>.tgz
```

A browser window will automatically open with the Sparkle configuration page. Fill in the settings:

- **Git Branch Name**: Name for the Sparkle data branch (default: `sparkle`)
- **Directory Path**: Path within the branch for data storage (default: `sparkle-data`)

Click **"Initialize Sparkle"** to complete setup. Once you see "Setup Complete!", you can close the browser window.

**Important**: Commit the updated `package.json` to share the Sparkle configuration with your team:

```bash
git add package.json
git commit -m "Configure Sparkle"
git push
```

### Step 2: Daily Usage

**Open the Sparkle web interface**:

```bash
npm run sparkle
```

This automatically starts the daemon if needed and opens your browser to the Sparkle dashboard where you can:
- Create and manage items
- Add entries and update statuses
- Define dependencies between items
- View pending work
- All changes are automatically committed and pushed to the Sparkle branch

**Optional commands**:

```bash
npm run sparkle-daemon  # Manually start daemon in background
npm run sparkle-halt    # Stop the daemon when you're done
```

Note: You usually don't need to run `sparkle-daemon` manually - the client launcher will start it automatically if it's not running.

## API Access

Sparkle provides a full HTTP API for programmatic access. All endpoints are documented in [overview.md](overview.md#api-reference). The daemon runs on localhost with an ephemeral port (stored in `.sparkle-worktree/sparkle-data/last_port.data`).

## Team Collaboration

**Initial setup** (done once per project):
1. One team member installs Sparkle and commits package.json
2. Other team members run `npm install` to get Sparkle

**Each team member** runs their own daemon to use Sparkle:
```bash
npm run sparkle-daemon  # Start daemon
npm run sparkle         # Open web interface
```

All changes are automatically synced between team members.

See [overview.md](overview.md) for architecture details, troubleshooting, and advanced usage.
