# Sparkle-in-Sparkle: Development & Testing Infrastructure

**Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.**

This document describes the infrastructure for developing, tracking, and testing Sparkle using Sparkle itself and automated testing frameworks.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Phase Status](#phase-status)
- [Phase 1: Clean Distribution Package](#phase-1-clean-distribution-package)
- [Phase 2: Using Sparkle to Track Sparkle Development](#phase-2-using-sparkle-to-track-sparkle-development)
- [Phase 3: Integration Test Framework](#phase-3-integration-test-framework)
- [Phase 4: Contributing](#phase-4-contributing)
- [Troubleshooting](#troubleshooting)

---

## Overview

### The Meta-Problem

Developing Sparkle creates a unique challenge:
- **Development `package.json`** contains build scripts, test configurations, and release tools
- **User-facing `package.json`** should only contain what users need to run Sparkle
- We want to use Sparkle to track Sparkle's own development
- We need automated integration tests without disrupting the development environment

### The Solution

This infrastructure provides:

1. **Clean Distribution** - Users receive a minimal `package.json` without development noise
2. **Production Tracking** - Use a stable Sparkle version to track development work
3. **Integration Testing** - Isolated test environments with side-by-side repositories
4. **Process Automation** - Scripts to manage setup, testing, and cleanup

---

## Architecture

### Three Types of Sparkle Instances

```
sparkle/                           # Main development repository
├── package.json                   # DEVELOPMENT package.json (full scripts)
│   └── devDependencies:
│       └── sparkle: "./sparkle-1.0.111.tgz"  # Stable version for tracking
│
├── dist/
│   └── package.json              # DISTRIBUTION package.json (minimal, generated)
│
├── .sparkle-worktree/            # TRACKING instance (stable v1.0.111)
│   └── sparkle-tracking/         # Tracks Sparkle development items
│
└── tests/
    └── temp/                     # TESTING instances (isolated, ephemeral)
        ├── repo.git/             # Bare git repo
        ├── clone1/               # Agent 1
        └── clone2/               # Agent 2
```

**Key Differences:**

| Instance Type | Purpose | Version | Lifespan |
|--------------|---------|---------|----------|
| **Development** | Building Sparkle | Current dev (1.0.112+) | Permanent |
| **Tracking** | Managing Sparkle tasks | Stable (1.0.111) | Permanent, manual upgrades |
| **Testing** | Integration tests | Current tarball | Ephemeral (seconds to minutes) |

---

## Phase Status

Track implementation progress for each phase:

### ✅ Phase 1: Clean Distribution Package
**Status:** ✅ COMPLETE

- [x] Create `bin/prepare-distribution.js` (git worktree approach)
- [x] Update `package.json` pack script
- [x] Test with `npm run pack`
- [x] Verify users see minimal package.json
- [x] Verified development package.json unchanged

**Implementation:** Uses git worktree clone at `.build-dist/` to create clean tarball without modifying development files.

**Last Updated:** 2025-01-23

---

### ✅ Phase 2: Sparkle-in-Sparkle Setup
**Status:** ✅ COMPLETE

- [x] Document setup procedure (this file)
- [x] Create `.gitignore` entries
- [x] Install Sparkle version (v1.0.112)
- [x] Package.json configured with devDependency
- [x] Configured Sparkle (branch: `sparkle-branch`, directory: `sparkle-data`)
- [x] Verified daemon running and UI accessible
- [ ] Create initial tracking items for development work

**Implementation:** Sparkle v1.0.112 is installed and running. Using stable version to track Sparkle's own development.

**Configuration:**
- Branch: `sparkle-branch`
- Directory: `sparkle-data`
- Worktree: `.sparkle-worktree/`
- Daemon running on ephemeral port
- Git fetch interval active

**Last Updated:** 2025-10-23

---

### ⚠️ Phase 3: Integration Test Framework
**Status:** ⚠️ IN PROGRESS (v1.0.126)

**Current Version:** v1.0.126

**Sub-phase 3.1: Infrastructure** ✅ COMPLETE
- [x] Create `tests/test-helpers.js`
- [x] Implement bare repo setup
- [x] Implement clone creation
- [x] Implement cleanup utilities
- [x] HTTP logging infrastructure (`src/httpLogger.js`, `tests/log-server.js`)
- [x] Auto-versioning via `pretest:integration` script
- [x] Query script for debugging (`bin/query-test-daemon.js`)

**Sub-phase 3.2: Basic Tests** ⚠️ IN PROGRESS
- [x] Test infrastructure created (3 tests defined)
- [x] Item creation test (structure complete)
- [x] Item retrieval test (structure complete)
- [x] Dependency management test (structure complete)
- [ ] Tests passing (blocked - see below)

**Sub-phase 3.3: Process Management** ✅ COMPLETE
- [x] Add `--test-mode` flag to daemon
- [x] Module execution guard with test mode bypass
- [x] Separated initialization logic to `src/sparkleInit.js`
- [x] Test directory structure (`.integration_testing/`)
- [x] Centralized logging (`integration-tests.log`)

**Sub-phase 3.4: Advanced Tests** ⏳ PENDING
- [ ] Eventual consistency test
- [ ] Multi-agent conflict resolution
- [ ] SSE event propagation
- [ ] API endpoint validation

**Current Blockers:**
- Tests are not yet passing - investigation needed
- All infrastructure is in place and working
- Daemon starts successfully in test harness
- HTTP logging fully functional

**Key Files:**
- `tests/integration-test.js` - Test runner
- `tests/test-helpers.js` - Test utilities
- `tests/log-server.js` - Centralized logging
- `bin/query-test-daemon.js` - Debug tool
- `src/httpLogger.js` - HTTP logging module
- `src/sparkleInit.js` - Initialization logic

**Last Updated:** 2025-10-24

---

### 📝 Phase 4: Documentation
**Status:** 🔄 IN PROGRESS *(this document)*

- [x] Create initial documentation structure
- [ ] Document Phase 1 completion
- [ ] Document Phase 2 setup instructions
- [ ] Document Phase 3 test usage
- [ ] Add troubleshooting guide

**Last Updated:** 2025-01-23

---

## Phase 1: Clean Distribution Package

### Problem

When users install Sparkle via npm, they receive the full development `package.json` containing:
- Release scripts (`npm run release`, `npm run release:minor`)
- Test scripts
- Development-specific configurations
- Build tools and prepack hooks

This creates confusion and exposes internal development details.

### Solution

Generate a minimal, user-focused `package.json` during the `npm pack` process.

### Implementation

**File:** `bin/prepare-distribution.js`

This script:
1. Reads the development `package.json`
2. Extracts only user-facing content
3. Writes a clean `package.json` for distribution

**Included in Distribution:**
- Essential metadata (name, version, description, author, license)
- User-facing bin commands:
  - `sparkle` (unified CLI: browser, cat, inspect)
  - `sparkle-daemon`
  - `sparkle-client`
  - `sparkle-halt`
  - `recover-sparkle`
- `postinstall` script (for first-time setup)
- `files` list (unchanged)

**Excluded from Distribution:**
- Development scripts (test, release, etc.)
- devDependencies
- Build configuration

### Usage

```bash
# Build release (automatically generates clean package.json)
npm run release

# Verify clean package.json
tar -xzf sparkle-1.0.112.tgz package/package.json
cat package/package.json
```

### Verification

After running `npm pack`, the generated tarball should contain a minimal `package.json` with no development scripts visible to users.

---

## Phase 2: Using Sparkle to Track Sparkle Development

### Overview

Use a **stable, pinned version of Sparkle** (v1.0.111) to track Sparkle's own development tasks, features, and bugs.

This is **NOT** dogfooding (testing new features). It's using a proven stable version for production tracking while developing newer versions.

### Why Not Use Development Sparkle?

- Development version may be unstable
- Want to control when we upgrade our tracking instance
- Tracking data is valuable - don't risk it with experimental code
- Same approach users would take (pin to stable version)

### Setup Instructions

**IMPORTANT:** Even when developing Sparkle, you must install Sparkle via npm and let it complete its normal installation and configuration process. Do NOT manually start agents or daemons until Sparkle is properly configured.

#### Step 1: Prepare Stable Version

```bash
# Ensure you have the current stable release
ls sparkle-1.0.112.tgz

# If not, create it from the release
npm run pack
```

#### Step 2: Install Sparkle via npm (Let it Configure Itself)

```bash
# Uninstall any previous version first
npm uninstall sparkle

# Install via npm --save-dev (this is crucial!)
npm install --save-dev ./sparkle-1.0.112.tgz
```

**What happens during install:**
1. The `postinstall` script runs automatically
2. It detects no configuration exists
3. It launches the daemon in `--postinstall` mode
4. It opens your browser to the configuration page

**WAIT for the browser to open. Do NOT run any sparkle commands yet.**

#### Step 3: Complete Configuration in Browser

When the browser opens, configure with:
- **Git Branch:** Choose a name like `sparkle-branch` or `sparkle-tracking`
- **Directory:** `sparkle-data` (recommended)

Click "Initialize Sparkle" and wait for completion.

**The configuration process will:**
1. Create the git branch
2. Set up the `.sparkle-worktree/` with sparse checkout
3. Add `sparkle_config` to your `package.json`
4. Add convenience scripts (`sparkle`, `sparkle-daemon`, `sparkle-halt`)
5. Initialize the data directory

#### Step 4: Verify Installation

After configuration completes, verify:
```bash
# Check the branch was created
git branch -a | grep sparkle

# Check the worktree exists
git worktree list

# Check config was added
grep sparkle_config package.json
```

#### Step 4: Update `.gitignore`

Add to `.gitignore`:
```
# Sparkle tracking instance
sparkle-1.0.*.tgz
.sparkle-worktree/
sparkle_install.log
```

The `.sparkle-worktree/` directory is managed by git worktree and contains committed data on the `sparkle-tracking` branch.

#### Step 5: Create Initial Items

Open Sparkle UI and create items for:
- Current development tasks
- Known bugs
- Feature requests
- Technical debt

### Using the Tracking Instance

```bash
# Start tracking instance
npx sparkle browser

# Open browser (http://localhost:<port>)
# View in List View, Tree View, or Inspector

# Stop when done
npx sparkle-halt
```

### Upgrading the Tracking Instance

When ready to upgrade to a newer stable version:

```bash
# 1. Stop current daemon
npx sparkle-halt

# 2. Backup (optional but recommended)
git worktree list  # Note the sparkle-tracking branch
git log sparkle-tracking  # Verify recent commits

# 3. Install new version
npm uninstall sparkle
npm install --save-dev ./sparkle-1.0.115.tgz

# 4. Restart daemon (will auto-upgrade)
npx sparkle browser

# 5. Verify data intact
# Open UI and confirm all items are present
```

**Note:** The `postinstall` script automatically detects version changes and gracefully shuts down the old daemon before upgrading.

---

## Phase 3: Integration Test Framework

### Overview

Automated tests that create isolated git repositories with multiple Sparkle instances to test:
- Eventual consistency across agents
- Multi-user collaboration scenarios
- API endpoint functionality
- Error handling and recovery

**Current Status (v1.0.126):**
- ✅ All infrastructure complete
- ✅ HTTP logging fully functional
- ✅ Test harness working
- ⚠️ Tests defined but not yet passing

### Architecture

Each test creates an **isolated environment** in `.integration_testing/`:

```
.integration_testing/
├── test-name/
│   ├── repo.git/              # Bare git repository (acts as origin)
│   └── clone1/                # Test agent
│       ├── .git/
│       ├── package.json
│       ├── node_modules/sparkle/
│       └── .sparkle-worktree/
└── integration-tests.log      # Centralized HTTP logs
```

**Key Points:**
- Tests install from tarball (not working directory)
- Real git operations (not mocked)
- HTTP logging to centralized log file
- Test mode flag (`--test-mode`) for process identification
- Preserved directories for debugging failures

### Test Infrastructure (`tests/test-helpers.js`)

Provides reusable utilities:

```javascript
// Create bare repo + N clones
async function createTestEnvironment(numClones = 2)

// Install Sparkle tarball in a directory
async function installSparkle(dir, tarballPath)

// Start daemon with --test-mode flag
async function startDaemon(dir, testId)

// Stop daemon by port
async function stopDaemon(port)

// Cleanup temp directory
async function cleanupEnvironment(testDir)

// HTTP helpers for API testing
async function apiCall(port, endpoint, body)
async function waitForSync(port, expectedSHA, timeout)
```

### Process Management

#### Test Mode Flag

Daemons started in test mode include a special flag:
```javascript
spawn('node', ['node_modules/sparkle/bin/sparkle_agent.js', '--test-mode', `--test-id=${testId}`])
```

This allows:
- Identifying test processes for cleanup
- Distinguishing from development daemon
- Tracking which test owns which daemon

#### Cleanup Script (`bin/test-cleanup.js`)

Kills orphaned test processes:
```bash
# Manual cleanup if tests crash
npm run test:cleanup

# Automatic cleanup in test teardown
```

Searches for processes with `--test-mode` flag and terminates them.

### Test Cases

#### Basic Tests
```javascript
test('Create and retrieve item', async () => {
  const { clone1, port1 } = await setupTestEnv();
  const item = await apiCall(port1, '/api/createItem', { tagline: 'Test' });
  const details = await apiCall(port1, '/api/getItemDetails', { itemId: item.itemId });
  assert(details.tagline === 'Test');
});
```

#### Eventual Consistency
```javascript
test('Item propagates between agents', async () => {
  const { clone1, clone2, port1, port2 } = await setupTestEnv();

  // Create in clone1
  const item = await apiCall(port1, '/api/createItem', { tagline: 'Test' });

  // Wait for push
  await sleep(2000);

  // Trigger fetch in clone2
  await apiCall(port2, '/api/fetch', {});
  await waitForSync(port2, expectedSHA, 10000);

  // Verify in clone2
  const items = await apiCall(port2, '/api/allItems', {});
  assert(items.items.some(i => i.itemId === item.itemId));
});
```

#### Multi-Agent Conflict
```javascript
test('Concurrent updates merge correctly', async () => {
  const { port1, port2 } = await setupTestEnv();

  // Create item in clone1
  const item = await apiCall(port1, '/api/createItem', { tagline: 'Original' });
  await waitForSync(port2);

  // Update from both agents simultaneously
  await Promise.all([
    apiCall(port1, '/api/addEntry', { itemId: item.itemId, text: 'Entry from agent 1' }),
    apiCall(port2, '/api/addEntry', { itemId: item.itemId, text: 'Entry from agent 2' })
  ]);

  // Wait for sync
  await sleep(5000);
  await waitForSync(port1);
  await waitForSync(port2);

  // Verify both entries present in both agents
  const details1 = await apiCall(port1, '/api/getItemDetails', { itemId: item.itemId });
  const details2 = await apiCall(port2, '/api/getItemDetails', { itemId: item.itemId });

  assert(details1.entries.length === 2);
  assert(details2.entries.length === 2);
});
```

### Running Tests

**CRITICAL: Testing Workflow**

Tests install from the tarball, so you **must** follow this workflow:

```bash
# 1. Make your code changes
vim src/myfile.js

# 2. Commit changes (required!)
git add src/myfile.js
git commit -m "Fix: description"

# 3. Build release (creates tarball)
npm run release

# 4. Run tests (install from tarball)
npm run test:integration
```

**Why this matters:**
- Tests run `npm install ./sparkle-1.0.X.tgz`
- Uncommitted changes are NOT in the tarball
- Testing uncommitted code leads to confusing failures
- Always test what you've committed and released

**Additional commands:**

```bash
# Run specific test file
node tests/integration-test.js

# Cleanup orphaned processes
npm run test:cleanup
```

### Debugging Test Failures

**Query Test Daemon Script**

The recommended way to debug is using `bin/query-test-daemon.js`:

```bash
# Get all items from a failed test
node bin/query-test-daemon.js \
  .integration_testing/create-and-retrieve-item/clone1 \
  /api/allItems

# Get specific item details
node bin/query-test-daemon.js \
  .integration_testing/add-dependency-between-items/clone1 \
  /api/getItemDetails \
  '{"itemId": "66661786"}'

# Check daemon status
node bin/query-test-daemon.js \
  .integration_testing/test-name/clone1 \
  /api/status
```

**What the script does:**
1. Starts a daemon in the test directory
2. Waits for it to be ready
3. Makes the API call
4. Outputs JSON response
5. Shuts down cleanly

**Debugging workflow:**
1. Run `npm run test:integration` (tests fail but preserve directories)
2. Identify failing test directory in `.integration_testing/`
3. Use query script to inspect actual state vs expected
4. Compare responses to understand failure
5. Fix code or test
6. Commit, release, test again

**Log files:**
- `.integration_testing/integration-tests.log` - All daemon logs from all tests
- Individual daemon logs in each test's `.sparkle-worktree/sparkle-data/daemon.log`

### Adding New Tests

1. Add test case to `tests/integration-test.js`
2. Use helpers from `tests/test-helpers.js`
3. Always cleanup in `finally` block
4. Use `--test-mode` flag for daemons
5. Verify cleanup with `ps aux | grep test-mode`
6. Follow the critical testing workflow (commit → release → test)

### What Gets Tested

**✅ Tested (No Browser Required):**
- API endpoints (all HTTP endpoints)
- Data persistence
- Git operations (commit, push, fetch)
- Eventual consistency
- Multi-agent scenarios
- Conflict resolution
- SSE event streams
- Error handling

**❌ Not Tested (Browser Required):**
- HTML rendering
- JavaScript UI interactions
- Visual components
- Browser-specific features

**Testing Strategy:**
- Use `curl` or Node's `http` module for API validation
- Verify JSON responses match schema
- Test state changes in git repository
- Monitor logs for errors

---

## Phase 4: Contributing

### Development Workflow

1. **Track work in Sparkle**
   ```bash
   npx sparkle browser
   # Create item for feature/bug
   ```

2. **Develop in main repo**
   ```bash
   git checkout -b feature/my-feature
   # Make changes
   ```

3. **Run tests**
   ```bash
   npm test                    # Unit tests
   npm run test:integration    # Integration tests
   ```

4. **Update tracking instance**
   - Add entries to items
   - Update status to completed
   - Create dependencies as needed

5. **Create release**
   ```bash
   npm run release  # Generates clean package.json
   ```

### Adding Features

1. Create Sparkle item for the feature
2. Implement code changes
3. Add integration tests if needed
4. Update documentation
5. Mark Sparkle item as completed
6. Create release

### Upgrading Tracking Sparkle

Only upgrade when:
- New stable version is released
- New features needed for tracking
- Bug fixes required

**Process:**
1. Verify current tracking data is backed up
2. Install new stable version
3. Restart daemon
4. Verify all items intact
5. Update this documentation with new version

---

## Troubleshooting

### Issue: "Sparkle is not configured" error

**Cause:** Trying to run sparkle commands before completing the configuration process.

**Solution:**
1. Do NOT run `npx sparkle browser` or `npx sparkle browser` manually before configuration
2. Let the `npm install` postinstall script complete
3. Wait for the browser to open with the configuration page
4. Complete the configuration in the browser
5. THEN you can use `npx sparkle browser`

**The correct flow is:**
```bash
npm install --save-dev ./sparkle-1.0.112.tgz
# Browser opens automatically - configure in browser
# Wait for "Setup Complete" message
# NOW you can run:
npx sparkle browser
```

---

### Issue: npm pack still includes dev scripts

**Cause:** `prepare-distribution.js` not running or not replacing package.json

**Solution:**
```bash
# Manually run prepare script
node bin/prepare-distribution.js

# Verify it created clean package.json
cat package.json

# Re-run pack
npm pack
```

### Issue: Tracking instance won't start

**Cause:** Port conflict or stale daemon

**Solution:**
```bash
# Check for running daemons
ps aux | grep sparkle

# Kill stale processes
npx sparkle-halt

# Check port file
cat .sparkle-worktree/sparkle-data/last_port.data
lsof -i :<port>

# Restart
npx sparkle browser
```

### Issue: Integration tests leave orphaned processes

**Cause:** Test crashed before cleanup

**Solution:**
```bash
# Run cleanup script
npm run test:cleanup

# Manual cleanup
ps aux | grep test-mode
kill <pid>

# Remove temp directories
rm -rf /tmp/sparkle-test-*
```

### Issue: Git worktree conflicts

**Cause:** Multiple worktrees on same branch

**Solution:**
```bash
# List worktrees
git worktree list

# Remove problematic worktree
git worktree remove .sparkle-worktree --force

# Restart daemon to recreate
npx sparkle browser
```

### Issue: Test fails due to timing

**Cause:** Fetch/push not completed before verification

**Solution:**
- Increase wait times in test
- Use `waitForSync()` helper instead of fixed delays
- Check fetch interval configuration in test setup

---

## Summary

This infrastructure enables:

1. ✅ **Clean Distribution** - Users see minimal package.json
2. ✅ **Production Tracking** - Stable Sparkle tracks development
3. ✅ **Automated Testing** - Integration tests in isolation
4. ✅ **Easy Contributing** - Clear workflow for developers

**Next Steps:**
- Complete Phase 1 implementation
- Set up tracking instance (Phase 2)
- Build test framework (Phase 3)
- Update this doc with completion status

---

**Document Version:** 1.0
**Last Updated:** 2025-01-23
**Status:** Living document - updated as phases complete
