# Getting Started with Sparkle

Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.

Sparkle is a collaborative task and dependency tracking system that uses Git as its storage and synchronization backend. This guide will help you install, configure, and start using Sparkle in your project.

## Table of Contents

- [Installation](#installation)
- [First-Time Configuration](#first-time-configuration)
- [Understanding the Settings](#understanding-the-settings)
- [Running Sparkle](#running-sparkle)
- [Updating to a New Version](#updating-to-a-new-version)
- [Team Workflow](#team-workflow)
- [Next Steps](#next-steps)

---

## Installation

Sparkle is distributed as an npm package (TGZ file). The recommended way to install it is as a development dependency.

### Step 1: Add Sparkle to Your Project

```bash
npm install --save-dev ./sparkle-1.0.78.tgz
```

**Why `--save-dev`?**
- Sparkle is a development and project management tool, not a runtime dependency
- It keeps your production dependencies clean
- Team members will automatically get it when they run `npm install`

### Step 2: Store the TGZ in Your Repository

**Important:** Commit the Sparkle TGZ file to your repository:

```bash
git add sparkle-1.0.78.tgz
git commit -m "Add Sparkle dependency tracking tool"
git push
```

**Why store the TGZ in the repo?**
1. **Version consistency**: Everyone on the team uses the exact same Sparkle version
2. **Easy setup**: New clones work immediately with `npm install` (no additional steps)
3. **Offline access**: The package is available even if npm registry is down
4. **Explicit upgrades**: You control when to upgrade, not npm

### What Happens During Installation?

When you run `npm install`, Sparkle's postinstall script:

1. **Checks for existing configuration** in your `package.json`
2. **If this is a fresh install** (no configuration found):
   - Automatically launches a browser with the configuration page
   - You'll complete the setup through the web UI
3. **If configuration exists** (existing install or new clone):
   - Does nothing - the daemon will handle setup on first run
   - Just run `npx sparkle browser` to start using it

---

## First-Time Configuration

On fresh installation, Sparkle opens a configuration page in your browser automatically. You'll see a setup wizard that guides you through three settings.

### The Configuration Page

The configuration page (`configuration.html`) is a simple form that asks for:

1. **Directory name** - Where to store Sparkle data
2. **Git branch name** - Which branch to use for data storage
3. **Fetch interval** - How often to sync with the remote repository

Here's what each setting means:

---

## Understanding the Settings

### 1. Directory (`directory`)

**Default:** `sparkle-data`

This is the directory name where Sparkle stores all its data files.

**What goes here?**
- Item files (one JSON file per item)
- Status change history
- Dependency relationships
- Entries and notes
- Monitor lists

**Can I change it?**
- Yes, but choose carefully - it's hard to change later
- Use a simple name like `sparkle-data`, `tasks`, or `project-data`
- Avoid spaces and special characters

**Example structure:**
```
sparkle-data/
├── 12345678.json                    # Item creation file
├── 12345678.status.*.json           # Status changes
├── 12345678.entry.*.json            # Entries/notes
├── 12345678.dependency.linked.*.json # Dependencies
└── statuses.json                    # Custom status definitions
```

---

### 2. Git Branch (`git_branch`)

**Default:** `sparkle-data`

Sparkle stores all its data on a separate Git branch, isolated from your application code.

**Why a separate branch?**
- Keeps your main branch clean
- Sparkle data has independent history
- Can be shared across team without polluting code commits
- Easy to exclude from deployments

**How it works:**
- Sparkle creates this branch automatically (if it doesn't exist)
- All data changes are committed to this branch
- The branch syncs with your remote repository
- Team members pull from the same branch

**Can I use an existing branch?**
- Yes, but only if it's dedicated to Sparkle
- Don't use `main`, `master`, or active development branches
- The branch will be managed entirely by Sparkle

---

### 3. Fetch Interval (`fetchIntervalMinutes`)

**Default:** `10` minutes

How often (in minutes) Sparkle automatically syncs with the remote repository.

**What does it do?**
- **Fetches** remote changes from the Git server
- **Merges** updates from other team members
- **Pushes** your local changes to the remote

**How to choose the right interval:**
- **Small team (2-5 people):** 10-15 minutes works well
- **Large team (5+ people):** 5 minutes for faster sync
- **Solo developer:** 30-60 minutes is fine
- **Offline work:** Set to a high value (e.g., 120 minutes)

**Can I trigger sync manually?**
- Yes! Use the "Fetch Now" button in the web UI
- Or use the HTTP API: `POST /api/fetch`

---

### Completing Configuration

Once you fill in the settings and click "Save Configuration":

1. **Settings saved to `package.json`:**
   ```json
   {
     "sparkle_config": {
       "git_branch": "sparkle-data",
       "directory": "sparkle-data",
       "fetchIntervalMinutes": 10
     }
   }
   ```

2. **Git branch created** (if it doesn't exist)

3. **Git worktree set up** at `.sparkle-worktree/` (hidden directory)

4. **Initial commit** made with directory structure

5. **Automatic redirect** to the user operations page

**IMPORTANT:** After configuration, you MUST commit and push the changes:

```bash
git add package.json package-lock.json .gitignore
git commit -m "Configure Sparkle settings"
git push
```

**Optionally commit the TGZ file** (if not already done):
```bash
git add sparkle-1.0.181.tgz
git commit -m "Add Sparkle package"
git push
```

**Why push these files?**
- `package.json` contains the `sparkle_config` that other team members need
- `package-lock.json` locks dependency versions for consistency
- `.gitignore` includes the `.sparkle-worktree` directory (auto-added by Sparkle)
- The TGZ file ensures everyone uses the same version
- The sparkle data branch is automatically pushed by the daemon

This ensures other team members can clone and immediately start using Sparkle.

---

## Running Sparkle

Sparkle runs as a background daemon (server) with a web-based user interface.

### Opening Sparkle in Your Browser (Recommended)

```bash
npx sparkle browser
```

**What happens:**
1. Checks if daemon is running (if not, starts it automatically)
2. Opens your browser to the Sparkle web interface
3. You can start creating items and managing dependencies

---

### Starting the Daemon Only

```bash
npx sparkle-daemon
```

**What this does:**
- Starts the Sparkle daemon in the background
- Does NOT open a browser
- Daemon keeps running until you stop it

**When to use:**
- Server environments
- When you want to access the UI later
- Running in the background during development

**Alternative command:**
```bash
sparkle-daemon
```
(Note: Only works if node_modules/.bin is in your PATH)

---

### Stopping the Daemon

```bash
npx sparkle-halt
```

**What this does:**
- Gracefully shuts down the Sparkle daemon
- Commits any pending changes
- Closes the server

**Alternative command:**
```bash
sparkle-halt
```
(Note: Only works if node_modules/.bin is in your PATH)

**Note:** The daemon also auto-shuts down after 60 seconds with no connected clients (to save resources).

---

## Updating to a New Version

When a new version of Sparkle is released, follow these steps:

### Step 1: Remove the Old TGZ

```bash
git rm sparkle-1.0.78.tgz
```

### Step 2: Add the New TGZ

```bash
# Download or copy the new version to your project root
git add sparkle-1.0.79.tgz
```

### Step 3: Install the New Version

```bash
npm install ./sparkle-1.0.79.tgz
```

### Step 4: Commit and Push

```bash
git commit -m "Update Sparkle to version 1.0.79"
git push
```

### Step 5: Notify Team

Let your team know to pull and run:

```bash
git pull
npm install
```

**Important Notes:**
- Your configuration in `package.json` is preserved
- All Sparkle data is preserved (it's in the git branch)
- No need to reconfigure
- The daemon will restart automatically on next `npm run sparkle`

---

## Team Workflow

Sparkle is designed for team collaboration through Git.

### For the First Team Member (You)

1. **Install Sparkle** (as described above)
2. **Configure** through the web UI (browser opens automatically)
3. **Commit and push** the configuration files

```bash
# After installation completes
git add package.json package-lock.json .gitignore
git commit -m "Configure Sparkle"
git push
```

**Optionally include the TGZ file** in your repo (recommended):
```bash
git add sparkle-1.0.181.tgz
git commit -m "Add Sparkle package"
git push
```

**What gets pushed:**
- ✅ `package.json` - Contains `sparkle_config` and `devDependencies` entry
- ✅ `package-lock.json` - Locks dependency versions
- ✅ `.gitignore` - Updated to exclude `.sparkle-worktree/`
- ✅ `sparkle-1.0.181.tgz` - (Optional) The package file itself
- ✅ `sparkle` branch - Automatically pushed by daemon with your data

**Note:** You do NOT need to manually push the sparkle data branch. The daemon automatically commits and pushes all changes to that branch after every operation.

---

### For New Team Members

When a teammate has an existing clone or creates a new clone of the repository:

#### Option 1: Existing Clone (Already has the repo)

```bash
git pull                    # Get the latest package.json with sparkle_config
npm install                 # Install or update Sparkle
```

#### Option 2: Fresh Clone (New checkout)

```bash
git clone <repository-url>
cd <project>
npm install                 # Automatically installs Sparkle
```

**What happens automatically:**
1. `npm install` reads `package.json` and finds the sparkle configuration
2. If the TGZ file was committed to the repo, it's automatically used
3. If the TGZ file was NOT committed, you'll need to provide it (e.g., copy `sparkle-1.0.181.tgz` to the project root first)
4. Sparkle is installed as a dev dependency (already specified as `devDependencies` in package.json - no `--save-dev` flag needed)
5. Postinstall detects existing configuration and skips the browser setup
6. Ready to use!

**Start using Sparkle:**
```bash
npx sparkle browser
```

On first run, the daemon will:
1. Fetch the sparkle data branch from origin
2. Set up the local worktree
3. Load all existing items and data
4. Start syncing automatically

---

### Collaboration Best Practices

1. **No manual git operations needed:**
   - The daemon automatically commits and pushes after every operation
   - You never need to manually push the sparkle-data branch
   - All synchronization is handled automatically

2. **Keep Sparkle version consistent:**
   - All team members use the same TGZ version
   - Update together (don't mix versions)

3. **Let Sparkle handle conflicts:**
   - Git merge conflicts are auto-resolved
   - Sparkle uses append-only data (conflicts are rare)

4. **Check sync status:**
   - Look at the status bar in the web UI
   - "Last synced: X minutes ago"
   - Green indicator = synced, Red = sync error

5. **Manual sync (fetch only):**
   - Sparkle automatically pushes all changes immediately
   - To fetch updates from teammates sooner, click "Fetch Now" in the web UI

---

## Next Steps

Now that Sparkle is installed and configured:

1. **Explore the Web UI**
   - Read [Web UI Usage Guide](web_ui_guide.md) for detailed instructions
   - Learn how to create items, add dependencies, and track progress

2. **Understand the API**
   - Read [Developer API Manual](developer_api.md)
   - Learn how to integrate Sparkle into your code
   - Use the HTTP API for custom integrations

3. **Learn the Architecture**
   - Read [Git Architecture Manual](git_architecture.md)
   - Understand how Sparkle uses Git under the hood
   - Learn about worktrees, branches, and data storage

---

## Troubleshooting

### Configuration page doesn't open

**Problem:** Running `npm install` but browser doesn't open.

**Solution:**
- This is normal if `package.json` already has `sparkle_config`
- Just run `npm run sparkle` to start using it

---

### "No remote repository found" error

**Problem:** Configuration fails with git remote error.

**Solution:**
1. Make sure your project is in a git repository: `git status`
2. Make sure you have a remote configured: `git remote -v`
3. If no remote exists, add one:
   ```bash
   git remote add origin <your-git-url>
   ```

---

### Daemon won't start

**Problem:** `npx sparkle browser` does nothing.

**Solution:**
1. Check if it's already running:
   ```bash
   # Check for sparkle-data/last_port.data file
   cat .sparkle-worktree/sparkle-data/last_port.data
   ```
2. If port exists, daemon is running - just open browser:
   ```bash
   open http://localhost:<port>/list_view.html
   ```
3. Force stop and restart:
   ```bash
   npx sparkle-halt
   npx sparkle-daemon
   ```

---

### Team member can't sync

**Problem:** New clone can't fetch sparkle-data branch.

**Solution:**
1. Make sure the branch exists on remote:
   ```bash
   git ls-remote origin sparkle-data
   ```
2. If missing, the first person needs to push it:
   ```bash
   git push origin sparkle-data
   ```
3. Then the team member runs:
   ```bash
   npx sparkle browser
   ```

---

### Changes aren't syncing

**Problem:** Updates from teammates aren't appearing.

**Solution:**
1. Check network/git access: `git fetch origin`
2. Force a fetch: Click "Fetch Now" in web UI
3. Check status bar for sync errors
4. Check daemon logs in `.sparkle-worktree/sparkle-data/daemon.log`

---

## Quick Reference

### Commands

```bash
# Install Sparkle
npm install --save-dev ./sparkle-1.0.78.tgz

# Open web UI in browser (starts daemon if needed)
npx sparkle browser

# View item details from command line
npx sparkle cat <itemId>

# View item with full dependency chains
npx sparkle inspect <itemId>

# Start daemon only (background)
npx sparkle-daemon

# Stop daemon
npx sparkle-halt

# Update to new version
git rm sparkle-1.0.78.tgz
git add sparkle-1.0.79.tgz
npm install ./sparkle-1.0.79.tgz
```

### Configuration Location

Configuration is stored in your project's `package.json`:

```json
{
  "sparkle_config": {
    "git_branch": "sparkle-data",
    "directory": "sparkle-data",
    "fetchIntervalMinutes": 10
  }
}
```

### Files and Directories

```
your-project/
├── sparkle-1.0.78.tgz           # Package file (commit to repo)
├── package.json                  # Contains sparkle_config
├── .sparkle-worktree/           # Hidden worktree (in .gitignore)
│   └── sparkle-data/            # Actual data files
│       ├── *.json               # Item and event files
│       └── last_port.data       # Current daemon port
└── node_modules/
    └── sparkle/                 # Installed package
```

### Git Branches

```bash
# Your normal branches (code)
main
develop
feature/xyz

# Sparkle's data branch (isolated)
sparkle-data  ← All Sparkle data lives here
```

---

## Testing Sparkle

For developers working on Sparkle itself, there are integration tests to validate functionality.

### Running Integration Tests

```bash
# Run all integration tests
npm run test:integration
```

**Important Testing Workflow:**

The tests install from a tarball, so you must follow this exact workflow:

1. **Make code changes** in your working directory
2. **Commit changes:** `git add <files> && git commit -m "description"`
3. **Build release:** `npm run release` (bumps version and creates tarball)
4. **Run tests:** `npm run test:integration`

**Why this matters:**
- Tests install from the tarball (e.g., `sparkle-1.0.126.tgz`), not your working directory
- Uncommitted changes are NOT included in the tarball
- Testing uncommitted code leads to confusing failures
- Always test what you've actually committed and released

### Debugging Test Failures

When tests fail, they preserve the test directories for inspection. Use the query script to debug:

```bash
# Get all items from a test
node bin/query-test-daemon.js \
  .integration_testing/create-and-retrieve-item/clone1 \
  /api/allItems

# Get specific item details
node bin/query-test-daemon.js \
  .integration_testing/add-dependency-between-items/clone1 \
  /api/getItemDetails \
  '{"itemId": "12345678"}'

# Check daemon status
node bin/query-test-daemon.js \
  .integration_testing/create-and-retrieve-item/clone1 \
  /api/status
```

The query script:
- Starts a daemon in the test directory
- Waits for it to be ready
- Makes the API call
- Outputs the JSON response
- Shuts down the daemon cleanly

### Test Directory Structure

After running tests, you'll find:

```
.integration_testing/
├── create-and-retrieve-item/
│   ├── clone1/              # Test instance
│   └── repo.git/            # Bare git repo
├── get-all-items/
│   ├── clone1/
│   └── repo.git/
├── add-dependency-between-items/
│   ├── clone1/
│   └── repo.git/
└── integration-tests.log    # Centralized logs
```

For more details on the testing infrastructure, see [Sparkle-in-Sparkle Documentation](sparkle-in-sparkle.md).

---

## Support

For more help:
- **Web UI Guide:** [web_ui_guide.md](web_ui_guide.md)
- **Developer API:** [developer_api.md](developer_api.md)
- **Git Architecture:** [git_architecture.md](git_architecture.md)
- **Testing Infrastructure:** [sparkle-in-sparkle.md](sparkle-in-sparkle.md)
- **Main README:** [README.md](../README.md)

---

**Copyright 2025 Limitless Knowledge Association**
Licensed under MIT License
