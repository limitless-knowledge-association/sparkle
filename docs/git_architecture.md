# Sparkle Git Architecture Manual

Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.

This manual explains how Sparkle uses Git as both its database and transport layer. Understanding this architecture helps you appreciate Sparkle's design decisions and troubleshoot issues.

## Table of Contents

- [Overview](#overview)
- [Why Git?](#why-git)
- [Why a Separate Branch?](#why-a-separate-branch)
- [Why Git Worktree?](#why-git-worktree)
- [Why Sparse Checkout?](#why-sparse-checkout)
- [Data Storage Format](#data-storage-format)
- [Synchronization Flow](#synchronization-flow)
- [Offline Operation](#offline-operation)
- [Conflict Resolution](#conflict-resolution)
- [File System Layout](#file-system-layout)
- [Git Commands Used](#git-commands-used)
- [Advanced Topics](#advanced-topics)

---

## Overview

Sparkle makes a bold architectural choice: **Git is the database**.

Instead of using a traditional database (PostgreSQL, MongoDB, etc.), Sparkle stores all data as JSON files in a Git repository. This provides:

- **Version control** - Complete history of all changes
- **Distributed sync** - Git handles multi-user collaboration
- **Conflict resolution** - Git's merge capabilities
- **Offline capability** - Work locally, sync when online
- **No database server** - Zero infrastructure required
- **Backup built-in** - Your Git remote is your backup

**Key principle:** Sparkle never touches your working directory. All operations happen in an isolated Git worktree.

---

## Why Git?

### Git as a Database

Traditional databases require:
- Server installation and management
- Network protocols (TCP connections)
- User authentication and permissions
- Backup strategies
- Replication configuration

Git provides all of this for free:
- **Storage**: Files in a repository
- **Transport**: `git fetch` and `git push`
- **Multi-user**: Merge conflicts and resolution
- **Backup**: Any Git remote (GitHub, GitLab, etc.)
- **Replication**: Every clone is a full copy

### Git as a Transport Layer

Instead of building a custom sync protocol, Sparkle uses Git's proven mechanisms:

```
Team Member A          Git Remote          Team Member B
     |                     |                     |
     | git push            |                     |
     |-------------------->|                     |
     |                     |    git fetch        |
     |                     |<--------------------|
     |                     |                     |
```

Every team member's daemon:
1. **Commits** changes locally (instant)
2. **Pushes** to origin (periodic, with retry)
3. **Fetches** from origin (every N minutes)
4. **Merges** remote changes (automatic)

**Result:** Distributed collaboration with no custom server code.

---

## Why a Separate Branch?

Sparkle stores all its data on a dedicated Git branch (e.g., `sparkle-data`), completely separate from your application code.

### Benefits

**1. Isolation**
- Application code on `main` branch
- Sparkle data on `sparkle-data` branch
- Never mix concerns

**2. Independent History**
- Your code commits don't include Sparkle updates
- Sparkle updates don't clutter your code history
- Clean `git log` for each purpose

**3. Easy Exclusion**
- Deploy only `main` branch to production
- Sparkle data stays in development environment
- No risk of deploying task data

**4. Flexible Sharing**
- Share the branch with team members
- Or keep it private
- Different permissions possible

### Example Branch Structure

```
Repository Branches:
├── main                 ← Your application code
├── develop              ← Development branch
├── feature/new-ui       ← Feature branches
└── sparkle-data         ← Sparkle's isolated branch
    └── sparkle-data/    ← Directory with JSON files
        ├── 12345678.json
        ├── 12345678.entry.*.json
        └── ...
```

### How It Works

When you configure Sparkle, it:
1. Creates a new branch from the latest `main` commit
2. Adds a single directory (e.g., `sparkle-data/`)
3. Commits the initial structure
4. Pushes to origin

**Your `main` branch never sees this.** The histories are independent:

```
main branch:
  A --- B --- C --- D (your code commits)

sparkle-data branch:
  A --- E --- F --- G --- H (Sparkle data commits)
        ↑
    branched from A
```

---

## Why Git Worktree?

Git worktree allows you to have multiple working directories from the same repository, each on a different branch.

### The Problem Without Worktree

If Sparkle modified your working directory:

```
your-project/
├── src/
├── package.json
└── sparkle-data/      ← Suddenly appears!
    └── 12345678.json
```

**Problems:**
1. Unexpected files appear in your workspace
2. Your IDE indexes them (slows down)
3. Accidentally commit them to `main`
4. Confusing when switching branches

### The Solution: Git Worktree

Worktree creates a separate directory for the Sparkle branch:

```
your-project/
├── src/                    ← Your working directory (on main)
├── package.json
├── .sparkle-worktree/      ← Isolated worktree (on sparkle-data)
│   └── sparkle-data/
│       └── 12345678.json
└── .git/                   ← Shared Git metadata
```

**Benefits:**

1. **Isolated workspace** - Sparkle files don't appear in your working directory
2. **Simultaneous branches** - You work on `main`, Sparkle works on `sparkle-data`
3. **Shared repository** - Both use the same `.git` directory
4. **Hidden from IDEs** - `.sparkle-worktree` is in `.gitignore`
5. **Clean working directory** - Your `git status` never shows Sparkle files

### How Worktree Works

```bash
# Create worktree for sparkle-data branch
git worktree add .sparkle-worktree sparkle-data

# Result:
# - Creates .sparkle-worktree/ directory
# - Checks out sparkle-data branch there
# - Links to main .git/ directory
# - Allows independent operations
```

Now you can:
- Work on `main` in your normal directory
- Sparkle works on `sparkle-data` in `.sparkle-worktree/`
- Both coexist without interference

### Worktree Auto-Management

Sparkle automatically:
1. **Creates** worktree on first run
2. **Validates** worktree on each startup
3. **Updates** worktree when fetching
4. **Commits** in worktree after changes
5. **Pushes** from worktree to origin

You never interact with the worktree directly.

---

## Why Sparse Checkout?

Sparse checkout allows you to check out only a subset of files from a branch, rather than the entire tree.

### The Efficiency Problem

Imagine the `sparkle-data` branch grows:

```
sparkle-data branch:
├── sparkle-data/        ← 10 MB of JSON files
├── old-backups/         ← 100 MB of old data
├── documentation/       ← 50 MB of docs
└── archived-items/      ← 200 MB of archives
```

If you check out the entire branch:
- 360 MB written to disk
- Slow checkout times
- Wasted space (only need `sparkle-data/`)

### The Solution: Sparse Checkout

Sparse checkout tells Git: "Only check out `sparkle-data/`, ignore everything else."

```
.sparkle-worktree/
└── sparkle-data/        ← Only this directory appears
    └── *.json           ← Fast and efficient
```

**Benefits:**

1. **Faster checkout** - Only download needed files
2. **Less disk space** - Don't store unused data
3. **Faster operations** - Fewer files to scan
4. **Cleaner workspace** - Only relevant files present

### How It Works

```bash
# Enable sparse checkout in the worktree
cd .sparkle-worktree
git sparse-checkout init --cone
git sparse-checkout set sparkle-data

# Result:
# - Only sparkle-data/ directory is checked out
# - Other directories on the branch are ignored
# - Git still tracks them, just doesn't materialize them
```

### Cone Mode

Sparkle uses "cone mode" sparse checkout:
- More efficient than legacy sparse checkout
- Faster operations
- Better performance with large repositories
- Recommended by Git maintainers

### What Happens Behind the Scenes

1. **Fetch**: Git downloads all objects (full branch)
2. **Sparse checkout**: Git only materializes `sparkle-data/` files
3. **Commit**: Changes only in `sparkle-data/` are committed
4. **Push**: Full commit is pushed, including metadata

**Result:** You get efficiency without losing data.

---

## Data Storage Format

Sparkle stores data as immutable, append-only JSON files.

### File Naming Convention

Every file name encodes its purpose:

```
{itemId}.json                                       # Item creation
{itemId}.tagline.{timestamp}.{random}.json          # Tagline change
{itemId}.entry.{timestamp}.{random}.json            # Entry added
{itemId}.status.{timestamp}.{random}.json           # Status change
{itemId}.dependency.linked.{targetId}.{ts}.{rand}   # Dependency added
{itemId}.dependency.unlinked.{targetId}.{ts}.{rand} # Dependency removed
{itemId}.monitor.added.{hash}.{ts}.{rand}           # Monitor added
{itemId}.monitor.removed.{hash}.{ts}.{rand}         # Monitor removed
statuses.json                                       # Custom statuses
```

**Components:**
- `{itemId}`: 8-digit unique identifier (10000000-99999999)
- `{timestamp}`: YYYYMMDDHHmmssSSS (millisecond precision)
- `{random}`: 4-character alphanumeric (collision prevention)
- `{targetId}`: Related item ID (for dependencies)
- `{hash}`: SHA256 hash (for monitors, to ensure uniqueness)

### Example Files

```
sparkle-data/
├── 12345678.json                                   # Item created
├── 12345678.tagline.20250122103045123.a1b2.json    # Tagline changed
├── 12345678.entry.20250122104523456.c3d4.json      # Entry added
├── 12345678.status.20250122110000000.e5f6.json     # Status updated
├── 12345678.dependency.linked.23456789.*.json      # Depends on item 23456789
├── 23456789.json                                   # Another item
└── statuses.json                                   # Custom statuses
```

### Immutability Principle

**Once written, files are never modified or deleted.**

This provides:
- **Complete history** - Every change is preserved
- **Audit trail** - Who did what, when
- **Conflict avoidance** - Two people writing different files (usually)
- **Append-only Git** - Git handles this efficiently

### State Reconstruction

The current state of an item is reconstructed by reading all its files in chronological order:

```javascript
// Pseudo-code
function buildItemState(itemId) {
  const files = getAllFilesFor(itemId);
  let state = {};

  for (const file of files.sortByTimestamp()) {
    if (file.type === 'creation') {
      state = { itemId, tagline: file.tagline, status: file.status };
    } else if (file.type === 'tagline') {
      state.tagline = file.tagline; // Latest tagline wins
    } else if (file.type === 'status') {
      state.status = file.status; // Latest status wins
    } else if (file.type === 'entry') {
      state.entries.push(file); // Accumulate entries
    }
    // ... etc
  }

  return state;
}
```

**Result:** The filesystem IS the database.

---

## Synchronization Flow

Sparkle synchronizes with the remote repository through a continuous cycle.

### Automatic Commit-Push After Every Operation

**Every time you make a change** (create item, update status, etc.):

```
1. User action (e.g., create item)
   ↓
2. Write JSON file to worktree
   ↓
3. git add -A
   ↓
4. git commit -m "Create item: ..."
   ↓
5. git push origin HEAD (with retry)
   ↓
6. Update complete
```

**This happens immediately and automatically.**

### Periodic Fetch-Merge from Origin

**Every N minutes** (configurable, default 10):

```
1. Timer expires
   ↓
2. git fetch origin
   ↓
3. Check if remote changed
   ↓
4. If changed: git merge origin/sparkle-data --no-edit
   ↓
5. Broadcast "dataUpdated" event to UI
   ↓
6. Restart timer
```

**This pulls in changes from teammates.**

### Manual Fetch

You can also trigger fetch manually:
- Click "Fetch Now" in web UI
- Or POST to `/api/fetch`

```
User clicks "Fetch Now"
   ↓
Same fetch-merge process
   ↓
UI refreshes immediately
```

### Full Synchronization Cycle

```
┌─────────────────────────────────────────────────────┐
│  Local Changes                                      │
│  ↓                                                  │
│  Commit (instant)                                   │
│  ↓                                                  │
│  Push (retry with backoff)                          │
│  ↓                                                  │
│  Origin Remote                                      │
│  ↓                                                  │
│  Fetch (every N minutes)                            │
│  ↓                                                  │
│  Merge (automatic)                                  │
│  ↓                                                  │
│  Local State Updated                                │
└─────────────────────────────────────────────────────┘
```

---

## Offline Operation

Sparkle gracefully handles network unavailability.

### How It Works

**When online:**
1. Commit locally ✓
2. Push to origin ✓
3. Fetch from origin ✓
4. Status: "Git Available" (green)

**When offline:**
1. Commit locally ✓
2. Push to origin ✗ (fails, that's OK)
3. Fetch from origin ✗ (fails, that's OK)
4. Status: "Git Offline" (yellow)

**When back online:**
1. Next operation attempts push
2. Push succeeds (with all queued commits)
3. Next fetch pulls remote changes
4. Status: "Git Available" (green)

### Commit-First Strategy

Sparkle always commits locally, even if push fails:

```javascript
try {
  await git.commit(message);  // Always succeeds
  await git.push();            // May fail (offline)
} catch (pushError) {
  // Commit succeeded locally
  // Push will retry later
}
```

**Benefits:**
- No data loss (commit is safe locally)
- Work continues uninterrupted
- Automatic sync when online

### Push Retry Logic

When push fails, Sparkle retries with exponential backoff:

```
Attempt 1: Push
  ↓ (fails)
Wait 1 second
  ↓
Attempt 2: Fetch + Merge + Push
  ↓ (fails)
Wait 2 seconds
  ↓
Attempt 3: Fetch + Merge + Push
  ↓ (fails)
Wait 4 seconds
  ↓
... (up to 5 attempts total)
  ↓
Mark as offline, give up for now
  ↓
Next user operation will retry
```

### Offline Indicator

The UI shows git availability:
- **Green**: "Git Available" - connected to remote
- **Yellow**: "Git Offline" - no network or remote unreachable

### Working Offline

You can use Sparkle fully offline:
- Create items ✓
- Update status ✓
- Add dependencies ✓
- Add entries ✓
- Everything works normally

**Only limitation:** Can't see teammates' changes until online.

### Reconnection

When network returns:
1. Sparkle automatically detects on next operation
2. Pushes all queued commits
3. Fetches remote changes
4. Merges automatically
5. UI updates with latest data

**No user intervention required.**

---

## Conflict Resolution

Git merge conflicts are rare with Sparkle's append-only design, but they can occur.

### How Conflicts Are Avoided

**1. Append-only files**
- Each change writes a new file
- Different files don't conflict
- Same file is very rare (requires same timestamp + random)

**2. Automatic merge**
- When push fails due to remote changes
- Sparkle fetches and merges
- Retries push with merged result

**3. Conflict-free data types**
- Item creation: Unique IDs (no collision)
- Entries: Timestamped files (different names)
- Dependencies: Link/unlink files (separate files)

### When Conflicts Happen

**Scenario:** Two team members create items at the exact same millisecond with the same random suffix.

**Probability:** ~1 in 1,000,000,000

**Resolution:**
```
1. User A commits: 12345678.json
2. User B commits: 12345678.json (same file)
3. User A pushes ✓
4. User B pushes ✗ (conflict detected)
5. Sparkle fetches User A's version
6. Git merge detects conflict
7. Sparkle uses merge strategy: "ours" (keep local)
8. User B's item gets a new ID on next creation
```

### Merge Strategy

Sparkle uses `--no-edit` merge:
```bash
git merge origin/sparkle-data --no-edit
```

This creates a merge commit automatically without requiring user input.

**In rare conflict cases:**
- Git's default merge strategy applies
- Typically: both versions kept (rare)
- Or: manual intervention needed (extremely rare)

### Manual Conflict Resolution

If a conflict requires manual resolution:

```bash
# Stop the daemon
npx sparkle-halt

# Navigate to worktree
cd .sparkle-worktree

# Check conflict status
git status

# Resolve conflicts
# Edit conflicted files, then:
git add <resolved-file>
git commit

# Restart daemon
npx sparkle-daemon
```

**Note:** This should almost never be necessary.

---

## File System Layout

Understanding where Sparkle stores data.

### Full Directory Structure

```
your-project/                      (Your application root)
│
├── .git/                          (Main Git repository)
│   ├── objects/                   (Git objects - all branches)
│   ├── refs/
│   │   ├── heads/
│   │   │   ├── main               (Your main branch)
│   │   │   └── sparkle-data       (Sparkle branch)
│   │   └── remotes/origin/
│   │       ├── main
│   │       └── sparkle-data
│   └── worktrees/
│       └── .sparkle-worktree/     (Worktree metadata)
│
├── .sparkle-worktree/             (Worktree directory - in .gitignore)
│   ├── .git                       (Worktree-specific Git file, links to main .git/)
│   └── sparkle-data/              (Checked out directory - sparse)
│       ├── .gitignore             (Ignores last_port.data)
│       ├── 12345678.json
│       ├── 12345678.entry.*.json
│       ├── 23456789.json
│       ├── statuses.json
│       └── last_port.data         (Not committed - runtime data)
│
├── src/                           (Your application code)
├── package.json                   (Contains sparkle_config)
└── sparkle-1.0.78.tgz            (Sparkle package - committed)
```

### What Goes Where

**Main repository (`.git/`):**
- All Git history (all branches)
- Branch references
- Worktree links
- Shared by all worktrees

**Worktree directory (`.sparkle-worktree/`):**
- Working files for sparkle-data branch
- Only `sparkle-data/` directory (sparse checkout)
- Not committed to your main branch (in .gitignore)
- Recreated automatically if deleted

**Sparkle data directory (`sparkle-data/`):**
- All Sparkle JSON files
- Committed to sparkle-data branch
- Synced across team via Git

### .gitignore Entries

Sparkle automatically adds to `.gitignore`:

```
.sparkle-worktree/
```

This ensures the worktree directory never appears in your main branch.

### Cleaning Up

**Safe to delete:**
```bash
rm -rf .sparkle-worktree/
```

Sparkle will recreate it on next run.

**NOT safe to delete:**
```bash
rm -rf .git/  # Don't do this! Destroys all Git history
```

---

## Git Commands Used

Sparkle uses standard Git commands. Here's what happens under the hood.

### Initialization

**Check if in a Git repo:**
```bash
git rev-parse --show-toplevel
```

**Check if remote exists:**
```bash
git remote
git ls-remote --heads origin
```

**Create the Sparkle branch:**
```bash
# Get latest commit from main
git rev-parse origin/main

# Create sparkle-data branch from that commit (local only, not checked out)
git branch sparkle-data <sha>
```

**Create the worktree:**
```bash
# If branch exists remotely (clone2+ scenario)
git worktree add --track -b sparkle-data .sparkle-worktree origin/sparkle-data
# The --track flag automatically establishes upstream tracking to origin/sparkle-data

# If branch only exists locally (first clone scenario)
git worktree add .sparkle-worktree sparkle-data
# Note: This does NOT establish upstream tracking automatically
```

**Configure sparse checkout:**
```bash
cd .sparkle-worktree
git sparse-checkout init --cone
git sparse-checkout set sparkle-data

# Important: Sparse checkout filters DIRECTORIES, not root-level files
# Root files from the branch will always appear in the worktree
# Only specified directories are checked out; all other directories are filtered
```

**Initialize and push the Sparkle branch (first clone only):**
```bash
# Create initial directory structure
mkdir -p sparkle-data
echo '{}' > sparkle-data/.gitkeep

# Commit initial structure
git add -A
git commit -m "Initialize Sparkle branch"

# Push with upstream tracking (CRITICAL for multi-clone workflow)
git push -u origin sparkle-data
# The -u flag sets up tracking so future git pull/push work without arguments

# Return to main repository
cd ..

# Add worktree directory to .gitignore
echo ".sparkle-worktree/" >> .gitignore
git add .gitignore
git commit -m "Add .sparkle-worktree to .gitignore"
git push
```

---

### Normal Operations

**Commit changes:**
```bash
cd .sparkle-worktree
git add -A
git commit -m "Create item: Fix login bug"
```

**Push to origin:**
```bash
# If upstream tracking is configured (recommended)
git push
# Works because upstream was set with -u during initial push

# Alternative (works but doesn't use upstream tracking)
git push origin HEAD
# This pushes but doesn't rely on or verify upstream tracking
```

**Pull changes from origin:**
```bash
# Recommended: Simple pull (requires upstream tracking)
git pull --no-edit
# This works because upstream tracking is configured

# What this does internally:
# 1. git fetch origin sparkle-data
# 2. git merge origin/sparkle-data --no-edit
```

**Fetch from origin:**
```bash
git fetch origin
```

**Merge remote changes (manual approach):**
```bash
git merge origin/sparkle-data --no-edit
```

**Check current HEAD:**
```bash
git rev-parse HEAD
```

**Verify upstream tracking:**
```bash
# Check which remote branch is tracked
git rev-parse --abbrev-ref --symbolic-full-name @{u}
# Should output: origin/sparkle-data

# See branch with upstream info
git branch -vv
# Should show: * sparkle-data <sha> [origin/sparkle-data] <message>
```

---

### Upstream Tracking

**Why upstream tracking is critical:**

Upstream tracking (also called "remote tracking") creates a relationship between your local branch and a remote branch. Without it:
- `git pull` requires explicit branch specification: `git pull origin sparkle-data`
- `git push` requires explicit branch specification: `git push origin sparkle-data`
- You can't easily see if your branch is ahead/behind the remote

With upstream tracking configured:
- `git pull` automatically knows to pull from `origin/sparkle-data`
- `git push` automatically knows to push to `origin/sparkle-data`
- `git status` shows "Your branch is ahead of 'origin/sparkle-data' by N commits"
- Multi-clone workflows become seamless

**How to establish upstream tracking:**

**Method 1: During first push (recommended)**
```bash
git push -u origin sparkle-data
# The -u flag (--set-upstream) establishes tracking
```

**Method 2: Using git branch command**
```bash
git branch --set-upstream-to=origin/sparkle-data sparkle-data
# Sets tracking after the remote branch already exists
```

**Method 3: During worktree creation (clone2+ scenario)**
```bash
git worktree add --track -b sparkle-data .sparkle-worktree origin/sparkle-data
# The --track flag automatically establishes tracking
```

**How to verify upstream tracking:**
```bash
# Method 1: Check upstream reference
git rev-parse --abbrev-ref --symbolic-full-name @{u}
# Should output: origin/sparkle-data

# Method 2: View branch with tracking info
git branch -vv
# Should show: * sparkle-data <sha> [origin/sparkle-data] <message>
#              The [origin/sparkle-data] part shows tracking is configured

# Method 3: Check configuration
git config --get branch.sparkle-data.remote
# Should output: origin
git config --get branch.sparkle-data.merge
# Should output: refs/heads/sparkle-data
```

**Troubleshooting missing upstream tracking:**

If you see errors like:
- "There is no tracking information for the current branch"
- "fatal: The current branch has no upstream branch"

Fix with:
```bash
git branch --set-upstream-to=origin/sparkle-data
# Run this from the worktree directory when on the sparkle-data branch
```

---

### Maintenance

**List worktrees:**
```bash
git worktree list
```

**Remove a worktree:**
```bash
git worktree remove .sparkle-worktree
```

**Prune stale worktrees:**
```bash
git worktree prune
```

**Check branch tracking:**
```bash
cd .sparkle-worktree
git rev-parse --abbrev-ref --symbolic-full-name @{u}
```

---

## Advanced Topics

### Multiple Clones

**Scenario:** You clone the repo on multiple machines or multiple developers work on the same project.

**First Clone (Initial Setup):**
1. Clone the repository: `git clone <repo-url>`
2. Install Sparkle: `npm install`
3. Daemon performs first-time setup:
   - Checks if `sparkle-data` branch exists on origin
   - If NOT exists (first install ever):
     - Creates local `sparkle-data` branch
     - Creates `.sparkle-worktree/` directory
     - Configures sparse checkout
     - Creates initial structure
     - Commits and pushes with `-u` flag: `git push -u origin sparkle-data`
     - Adds `.sparkle-worktree/` to `.gitignore` and commits
   - If exists (someone else already set up Sparkle):
     - Fetches `sparkle-data` branch from origin
     - Creates worktree with tracking: `git worktree add --track -b sparkle-data .sparkle-worktree origin/sparkle-data`
     - Configures sparse checkout
     - `.gitignore` already has `.sparkle-worktree/` entry (from origin)

**Subsequent Clones:**
1. Clone the repository: `git clone <repo-url>`
2. Install Sparkle: `npm install`
3. Daemon detects existing `sparkle-data` branch on origin
4. Sets up worktree with automatic tracking:
   ```bash
   git fetch origin sparkle-data
   git worktree add --track -b sparkle-data .sparkle-worktree origin/sparkle-data
   cd .sparkle-worktree
   git sparse-checkout init --cone
   git sparse-checkout set sparkle-data
   ```
5. All set - worktree has upstream tracking, pulls work automatically

**Key Differences:**
- **First clone**: Uses `git push -u` to establish upstream tracking
- **Later clones**: Use `git worktree add --track` which establishes tracking automatically
- **Both** result in properly configured upstream tracking

**Synchronization Between Clones:**

When Developer A makes changes:
```bash
cd .sparkle-worktree
# Make changes to files
git add -A
git commit -m "Create item: New feature"
git push  # Works because upstream tracking is configured
```

When Developer B wants to see those changes:
```bash
cd .sparkle-worktree
git pull  # Works because upstream tracking is configured
# Changes from Developer A now appear locally
```

**Both clones stay in sync** through:
- Periodic `git fetch` (daemon polls every N minutes)
- Automatic `git merge` of fetched changes
- Push on every local change

### Branch Management

**Viewing the sparkle-data branch:**
```bash
# Switch to sparkle-data in main workspace (not recommended)
git checkout sparkle-data

# View files
ls sparkle-data/

# Switch back
git checkout main
```

**Better:** Use the worktree (already set up by Sparkle)

**Deleting the branch:**
```bash
# Delete locally
git branch -D sparkle-data

# Delete remotely
git push origin --delete sparkle-data
```

**Note:** Deleting the branch deletes ALL Sparkle data. Only do this if you're sure!

### Performance Characteristics

**Write performance:**
- Create item: ~5-10ms (file write + commit)
- Push: ~100-500ms (network dependent)
- Total: ~100-500ms per operation

**Read performance:**
- Get item: ~1-5ms (read files + parse JSON)
- List all items: ~10-50ms (depends on item count)

**Storage efficiency:**
- ~1KB per item (base)
- ~500 bytes per entry
- ~200 bytes per dependency
- Compressed by Git (typically 50% reduction)

**Scalability:**
- Works well up to ~10,000 items
- Sparse checkout keeps worktree small
- Git handles large file counts efficiently

### Git LFS (Large File Storage)

**Not needed for Sparkle** because:
- All files are small JSON (~1KB each)
- Git handles small text files well
- No binary files

**If you had large attachments:**
- Could use Git LFS for attachments
- Keep Sparkle data as regular files
- Separate concerns

### Backup and Recovery

**Backup:**
Your Git remote (GitHub, GitLab, etc.) IS your backup.

**Recovery:**
```bash
# Clone from remote
git clone <repo-url>

# Install Sparkle
npm install

# Run daemon
npx sparkle browser

# All data restored automatically
```

**Manual backup:**
```bash
# Backup the sparkle-data branch
git archive sparkle-data -o sparkle-backup.tar.gz
```

---

## Verification Scripts

To verify that the git sparse worktree architecture works correctly, see the reference scripts in `references/gitsetup/`:

- `01-initial-setup.sh` - Demonstrates first clone setup with upstream tracking
- `02-clone2-workflow.sh` - Demonstrates second clone setup and cross-clone commits
- `03-clone1-pull-verification.sh` - Demonstrates pull operations work automatically

These scripts prove that:
- Upstream tracking is correctly established
- Sparse checkout filters directories (not root files)
- Multi-clone synchronization works seamlessly
- `.gitignore` prevents worktree from appearing as untracked
- `git pull` and `git push` work without arguments when upstream is set

Run all three in sequence to verify the complete workflow:
```bash
rm -rf /tmp/shell-explore-1 /tmp/clone1 /tmp/clone2
./references/gitsetup/01-initial-setup.sh && \
./references/gitsetup/02-clone2-workflow.sh && \
./references/gitsetup/03-clone1-pull-verification.sh
```

Expected result: **40/40 tests passed**

See `references/gitsetup/README.md` for detailed documentation on what each script demonstrates.

---

## Conclusion

Sparkle's Git-based architecture provides:

✅ **No database server** - Git is the database
✅ **Built-in sync** - Git handles distribution
✅ **Offline support** - Work anywhere, sync later
✅ **Version history** - Complete audit trail
✅ **Zero infrastructure** - Just Git and Node.js
✅ **Team collaboration** - Git's merge capabilities
✅ **Backup included** - Git remote is your backup

**Trade-offs:**
- Not suitable for high-frequency updates (>100/sec)
- Not a replacement for transactional databases
- Best for development/project management tools

**Perfect for:**
- Task and dependency tracking
- Team collaboration on projects
- Development workflow management
- Anywhere Git is already used

---

## Testing Infrastructure

### Integration Test Architecture

Sparkle includes integration tests that create isolated Git environments to validate multi-agent scenarios and eventual consistency.

**Test Environment Structure:**

```
.integration_testing/
├── test-name/
│   ├── repo.git/              # Bare repository (acts as origin)
│   └── clone1/                # Test agent clone
│       ├── .git/              # Full git clone
│       ├── package.json       # Test configuration
│       ├── node_modules/
│       │   └── sparkle/       # Installed from tarball
│       └── .sparkle-worktree/ # Agent's worktree
└── integration-tests.log      # Centralized logs
```

**Key Points:**

1. **Isolated Environments**: Each test gets its own bare repo + clones
2. **Real Git Operations**: Uses actual git fetch/push/merge (not mocked)
3. **Eventual Consistency**: Tests verify changes propagate between agents
4. **Clean Slate**: Tests start fresh, no shared state

### Testing Workflow

**Critical:** Tests install from the tarball, not the working directory:

```bash
# 1. Make changes and commit
git add src/myfile.js
git commit -m "Fix bug"

# 2. Build release tarball
npm run release  # Creates sparkle-1.0.X.tgz

# 3. Run tests (install from tarball)
npm run test:integration
```

**Why this matters:**
- Tests use `npm install ./sparkle-1.0.X.tgz`
- Uncommitted changes are NOT in the tarball
- Testing uncommitted code = confusing failures
- Always test committed + released code

### Test Mode Flag

Daemons started in test mode use the `--test-mode` flag:

```bash
node bin/sparkle_agent.js --test-mode
```

**Effects:**
- HTTP logging enabled (centralized logs)
- Process identifiable for cleanup
- Module execution guard bypassed
- Isolated from development daemon

### Debugging Tests

Use the query script to inspect test state:

```bash
# Query API in test directory
node bin/query-test-daemon.js \
  .integration_testing/test-name/clone1 \
  /api/allItems

# Check git state
cd .integration_testing/test-name/clone1
git log sparkle-data
git status
ls .sparkle-worktree/sparkle-data/
```

**Test logs:** `.integration_testing/integration-tests.log` contains all daemon logs from all test processes.

### What Tests Validate

**Git Operations:**
- Commit creation and format
- Push to bare repository
- Fetch from remote
- Merge conflict resolution
- Sparse checkout behavior
- Worktree management

**Data Consistency:**
- Items created in one agent appear in another
- Dependencies preserved across sync
- Status changes propagate
- Entries maintain order
- Audit trail completeness

**Multi-Agent Scenarios:**
- Concurrent creates
- Simultaneous updates
- Conflict resolution
- Event propagation

For complete testing details, see [Sparkle-in-Sparkle Guide](sparkle-in-sparkle.md).

---

## Next Steps

- **Installation:** [Getting Started Guide](getting_started.md)
- **Usage:** [Web UI Usage Guide](web_ui_guide.md)
- **Integration:** [Developer API Manual](developer_api.md)
- **Testing:** [Sparkle-in-Sparkle Guide](sparkle-in-sparkle.md)

---

**Copyright 2025 Limitless Knowledge Association**
Licensed under MIT License
