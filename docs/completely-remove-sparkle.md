# Completely Removing Sparkle

This guide explains how to completely remove Sparkle from your repository and start fresh with a clean installation.

## When to Use This Guide

Use these steps if you want to:
- Remove all Sparkle data and start with an empty repository
- Upgrade from a very old version (e.g., version 47) to the current version
- Reset Sparkle completely due to corruption or configuration issues

## Finding Your Configuration Values

Before proceeding, you need to know your Sparkle configuration. Open your `package.json` file and find the `sparkle_config` section:

```json
{
  "sparkle_config": {
    "git_branch": "your-branch-name",
    "directory": "your-directory-name",
    "worktree_path": "your-worktree-path"
  }
}
```

Note these values:
- **git_branch**: The name of the git branch where Sparkle stores data (default: `sparkle-data`)
- **directory**: The directory name within that branch (default: `sparkle-data`)
- **worktree_path**: The git worktree directory path (default: `.sparkle-worktree`)

**Important for older installations:** If your `sparkle_config` doesn't have a `worktree_path` field, your installation predates this feature and the worktree path is hardcoded to `.sparkle-worktree/`.

You'll need the `git_branch` and `worktree_path` values in the steps below.

## Complete Removal Steps

### Step 1: Stop the Daemon

If Sparkle is currently running, stop it:

```bash
npx sparkle-halt
```

### Step 2: Remove the Worktree

The Sparkle branch is checked out in a git worktree. You must remove this first:

```bash
# Use your actual worktree_path value from sparkle_config
# If worktree_path is not in your config, use .sparkle-worktree
git worktree remove .sparkle-worktree

# If that fails, force remove it:
git worktree remove --force .sparkle-worktree
```

### Step 3: Delete the Local Branch

Now you can delete the local git branch (use the branch name from your `sparkle_config`):

```bash
# Replace "sparkle-data" with your actual git_branch value
git branch -D sparkle-data
```

### Step 4: Delete the Remote Branch

Delete the branch from the remote repository:

```bash
# Replace "sparkle-data" with your actual git_branch value
git push origin --delete sparkle-data
```

### Step 5: Clean Up Installation Files

Remove old Sparkle package files:

```bash
# Remove any old TGZ files
rm -f sparkle-*.tgz

# Remove installation logs
rm -f sparkle_install.log

# Remove Sparkle from node_modules
rm -rf node_modules/sparkle/
```

### Step 6: Update package.json

Edit your `package.json` and remove:
- The `sparkle_config` section
- The `sparkle` entry from `devDependencies` (or `dependencies`)
- The sparkle scripts (`sparkle`, `sparkle-daemon`, `sparkle-halt`) if you want a completely clean start

### Step 7: Install New Version

Now you can install the new version of Sparkle:

```bash
# Copy the new TGZ file to your repository
cp /path/to/sparkle-1.0.176.tgz .

# Install it
npm install --save-dev ./sparkle-1.0.176.tgz

# Commit the changes
git add package.json sparkle-1.0.176.tgz
git commit -m "Install Sparkle v1.0.176"
git push
```

The installation will automatically launch the configuration UI in your browser where you can set up Sparkle fresh.

## Alternative: Simpler Approach Using a Different Branch Name

If you don't need to completely remove the old data (just want to start fresh), you can simply use a **different branch name** during the new installation:

1. Stop the daemon: `npx sparkle-halt`
2. Remove the worktree: `rm -rf <your-worktree-path>/` (e.g., `rm -rf .sparkle-worktree/`)
3. Remove `sparkle_config` from `package.json`
4. Install the new version: `npm install --save-dev ./sparkle-1.0.176.tgz`
5. During configuration, use a new branch name (e.g., `sparkle-data-v2` instead of `sparkle-data`)

This leaves the old branch in your repository but it will be ignored. You can delete it later at your convenience.

## Recovery

Note that deleting a git branch only removes the pointer to the commits, not the commits themselves. If you need to recover the old Sparkle branch:

```bash
# View recent branch deletions
git reflog

# Look for the commit SHA where the branch was deleted
# Then recreate the branch:
git branch sparkle-data <commit-sha>
```

Commits are typically retained for at least 30 days before git's garbage collection removes them.

## Verification

After completing a fresh install, verify everything is working:

```bash
# Start Sparkle
npx sparkle browser

# Check that the new branch was created
git branch -a | grep sparkle

# Verify the worktree exists (use your configured worktree_path)
ls -la .sparkle-worktree/
```

You should see your new Sparkle branch and an empty repository ready to use.
