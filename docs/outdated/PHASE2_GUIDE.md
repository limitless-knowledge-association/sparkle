# Sparkle Phase 2 - Installation and Usage Guide

Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.

## Overview

Sparkle Phase 2 transforms Sparkle into a daemon-based web service that uses a dedicated git branch for storage. Each developer runs their own Sparkle daemon instance, and all changes are automatically committed and pushed to a shared git branch.

## Features

- **Daemon Architecture**: Background process serving HTTP API on localhost
- **Git Branch Storage**: Dedicated branch for Sparkle data, isolated from working directory
- **Multi-Developer Support**: Each clone can have its own daemon instance
- **Web Interface**: Browser-based UI for managing items and viewing status
- **Automatic Sync**: Changes are automatically committed and pushed; periodic fetch every 10 minutes
- **Zero External Dependencies**: Pure Node.js implementation (no npm dependencies)

## Installation

### Step 1: Create the Package

From the Sparkle repository:

```bash
npm pack
```

This creates `sparkle-1.0.15.tgz` (or current version number).

### Step 2: Add to Your Project Repository

Copy the .tgz file to your project repository (or add it to a shared location):

```bash
cp sparkle-1.0.15.tgz /path/to/your/project/
```

### Step 3: Install in Your Project

In your project directory (install as a dev dependency):

```bash
npm install --save-dev ./sparkle-1.0.15.tgz
```

Or commit the .tgz to your repo and add it to devDependencies in package.json:

```json
{
  "devDependencies": {
    "sparkle": "file:./sparkle-1.0.15.tgz"
  }
}
```

Then team members can install with:

```bash
npm install
```

## First-Time Setup

### Prerequisites

- Your project must be a git repository
- You must have a remote named "origin" configured
- You must have committed at least one change to origin

### Initialize Sparkle

1. Start the Sparkle daemon:

```bash
npm run sparkle-daemon
```

2. If this is the first time, a browser window will open with the configuration page.

3. Fill in the configuration:
   - **Git Branch Name**: Name for the Sparkle branch (default: `sparkle`)
   - **Directory Path**: Relative path within the branch (default: `sparkle-data`)
   - **Add npm script**: Check this to enable `npm run sparkle` command

4. Click "Initialize Sparkle"

5. The daemon will:
   - Create a new git branch from the latest origin commit
   - Set up a git worktree in `.sparkle-worktree/` (git-ignored)
   - Create the data directory and .gitignore
   - Push the branch to origin
   - Update your `package.json` with the configuration

6. **Commit the package.json changes** to share the configuration with your team:

```bash
git add package.json
git commit -m "Configure Sparkle"
git push
```

## Daily Usage

### Starting the Daemon

In your project directory:

```bash
npm run sparkle-daemon
```

The daemon will:
- Check if another daemon is already running (exits if yes)
- Load the configuration from package.json
- Set up the git worktree
- Perform an initial fetch
- Start the web server on a random localhost port
- Write the port to `.sparkle-worktree/sparkle-data/last_port.data`

**Keep the daemon running** in a terminal window, or use a terminal multiplexer like `tmux` or `screen`.

### Opening the Web Interface

If you enabled the npm script during setup:

```bash
npm run sparkle
```

This will:
- Read the port from the daemon
- Check if the daemon is responding
- Open your browser to the Sparkle interface

**Manual Access**: If you know the port number, navigate to `http://localhost:<port>` in your browser.

### Using the Web Interface

The web interface provides:

- **Dashboard**: View daemon status, branch info, and last update time
- **Pending Work**: List of items ready to be worked on (not completed, no unmet dependencies)
- **Quick Actions**:
  - **Create Item**: Add a new item with tagline and status
  - **Fetch Updates**: Manually trigger a git fetch
  - **View Item**: Look up item details by ID

- **Item Operations**:
  - View item details, entries, dependencies, and history
  - Add entries to items
  - Update item status
  - All operations are automatically committed and pushed

### Stopping the Daemon

Stop the background daemon:

```bash
npm run sparkle-halt
```

## Architecture Details

### File Structure After Installation

```
your-project/
├── node_modules/
│   └── sparkle/                    # Installed package
│       ├── bin/                    # Executable scripts
│       │   ├── sparkle_agent.js
│       │   └── sparkle_client_launch.js
│       ├── public/                 # HTML UI files
│       │   ├── configuration.html
│       │   └── user_operation.html
│       └── src/                    # Core library
├── .sparkle-worktree/              # Git worktree (git-ignored)
│   └── sparkle-data/               # Sparkle branch checkout
│       ├── .gitignore              # Ignores last_port.data, *.log
│       ├── last_port.data          # Current daemon port
│       ├── statuses.json           # (Optional) Valid statuses
│       └── *.json                  # Item files
├── package.json                    # Contains sparkle_config
└── sparkle-2.0.0.tgz              # (Optional) Package file
```

### Git Branch Workflow

1. **Sparkle Branch**: A dedicated branch (e.g., `sparkle`) stores all Sparkle data
2. **Git Worktree**: The daemon uses a worktree in `.sparkle-worktree/` to interact with the branch
3. **Isolation**: Your working directory is never affected; you can work on any branch
4. **Automatic Commits**: Every API operation that changes state triggers a commit and push
5. **Periodic Fetch**: The daemon fetches every 10 minutes
6. **Conflict Resolution**: If push fails due to conflicts, the daemon automatically retries with merge (up to 5 times)

### Multi-Developer Workflow

- **Each Clone = One Daemon**: Each developer's clone should have its own daemon instance
- **Shared Branch**: All daemons push to the same Sparkle branch in origin
- **Port File Ignored**: `last_port.data` is git-ignored so each daemon can write its own port
- **Change Polling**: The web UI polls every 5 seconds and automatically refreshes when changes are detected
- **Concurrent Pushes**: Handled automatically with fetch-merge-push retry logic

## API Reference

The daemon exposes an HTTP API on `localhost:<port>`. All endpoints accept/return JSON.

### System Endpoints

- **GET /**: Serves the web interface
- **GET /api/ping**: Health check, returns `{status: "ok"}`
- **GET /api/status**: Get daemon status (branch, directory, SHA, etc.)
- **GET /api/getLastChange**: Returns `{sha, timestamp}` for change detection
- **POST /api/fetch**: Manually trigger git fetch
- **POST /api/shutdown**: Gracefully stop the daemon

### Sparkle API Endpoints

All operations require a JSON body via POST:

- **POST /api/createItem**: Create new item
  - Body: `{tagline: string, status?: string}`
  - Returns: `{itemId: string}`

- **POST /api/getItemDetails**: Get item details
  - Body: `{itemId: string}`
  - Returns: Full item object

- **POST /api/alterTagline**: Update item tagline
  - Body: `{itemId: string, tagline: string}`

- **POST /api/addEntry**: Add entry to item
  - Body: `{itemId: string, text: string}`

- **POST /api/updateStatus**: Update item status
  - Body: `{itemId: string, status: string, text?: string}`

- **POST /api/addDependency**: Add dependency
  - Body: `{itemNeeding: string, itemNeeded: string}`

- **POST /api/removeDependency**: Remove dependency
  - Body: `{itemNeeding: string, itemNeeded: string}`

- **POST /api/addMonitor**: Monitor an item (current user)
  - Body: `{itemId: string}`

- **POST /api/removeMonitor**: Stop monitoring (current user)
  - Body: `{itemId: string}`

- **GET /api/pendingWork**: Get all pending work items
  - Returns: `{items: string[]}`

## Troubleshooting

### "No git remote 'origin' found"

Your repository needs a remote named "origin". Add one:

```bash
git remote add origin <url>
git push -u origin main
```

### "Another Sparkle daemon is already running"

This is normal if you try to start multiple daemons in the same clone. Only one daemon per clone is needed.

### "Sparkle daemon is not responding"

The daemon may have crashed or been stopped. Restart it with `npm run sparkle-daemon`.

### "Branch not in origin" warning

The Sparkle branch was deleted from origin. The daemon continues to work with local data but cannot push. Either:
- Manually push the branch: `cd .sparkle-worktree && git push -u origin sparkle`
- Re-initialize Sparkle (requires cleanup first)

### Stale port file

If the daemon crashes, `last_port.data` may contain a stale port. The daemon automatically detects this and overwrites it on next start.

## Cross-Platform Support

Sparkle Phase 2 works on:
- **macOS**: Uses `open` command
- **Windows**: Uses `cmd /c start` command
- **Linux**: Uses `xdg-open` command

No external dependencies are required; all functionality uses Node.js built-in modules.

## Upgrading Sparkle

To upgrade to a new version:

1. Generate the new .tgz file from the updated Sparkle repository
2. Copy it to your project
3. Update the installation:

```bash
npm install ./sparkle-X.Y.Z.tgz
```

4. Restart the daemon

The configuration in package.json and the Sparkle branch data are preserved.

## Uninstalling

1. Stop the daemon (Ctrl+C)
2. Remove the npm package:

```bash
npm uninstall sparkle
```

3. Remove the configuration from package.json (manually)
4. Optionally delete the Sparkle branch:

```bash
git branch -D sparkle
git push origin --delete sparkle
```

5. Remove `.sparkle-worktree/` if it exists:

```bash
rm -rf .sparkle-worktree
```
