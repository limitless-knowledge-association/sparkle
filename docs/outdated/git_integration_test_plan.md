# Git Operations Integration Test Plan

**Date**: 2025-10-25
**Status**: Ready to Execute

## Overview

Now that the Git Operations migration is complete (all unit tests pass), we need to verify it works with real git repositories. This requires integration tests that exercise the new GitOperations class with actual git commits, pushes, pulls, and aggregate invalidation.

## Test Strategy

### Approach
- Build a release package (`npm pack`)
- Create integration tests using existing `test-helpers.js` infrastructure
- Use real git repositories (bare repo + clones)
- **Test through Sparkle class API** (same as unit tests, but WITH git)
- Verify the entire flow works end-to-end: Sparkle → Controllers → GitOps → Git → Pull → Aggregates

### Why Not Unit Tests?
Current unit tests (`tests/sparkle.test.js`):
- Only create directories (no git repos)
- Test Sparkle class in isolation
- Pass `gitOps = null` so git operations aren't exercised
- Should remain unchanged (they verify non-git functionality)

Integration tests will:
- Create real git repositories with clones
- Use **Sparkle class API** (createItem, addEntry, alterTagline, etc.)
- Verify controllers notify GitOperations
- Verify git commits, pulls happen automatically
- Verify aggregates invalidate and rebuild in other clones
- **Test the same user-facing API as unit tests, but with real git**

## Test Scenarios

### Test 1: Create Item with Git Integration
**Goal**: Verify Sparkle.createItem() triggers git commit and push

**Setup**:
- Create bare repo + 1 clone
- Initialize git repo in clone
- Create Sparkle instance (with GitOperations)

**Steps**:
1. `await sparkle.createItem('Test item')` - Use Sparkle API
2. Wait for debounced commit (6 seconds)
3. Check git log for commit
4. Verify file committed to git
5. Verify push to origin succeeded

**Expected**:
- Sparkle creates item file
- Controller notifies GitOperations
- GitOperations debounces and commits
- File appears in git log
- Origin has the commit

### Test 2: Multiple Operations Debounce to Single Commit
**Goal**: Verify multiple Sparkle API calls debounce to single commit

**Setup**:
- Create bare repo + 1 clone
- Create Sparkle instance

**Steps**:
1. `await sparkle.createItem('Item 1')`
2. `await sparkle.createItem('Item 2')`
3. Get itemId2, then `await sparkle.addEntry(itemId2, 'Entry text')`
4. All within 2 seconds
5. Wait for debounce (6 seconds from last operation)
6. Check git log

**Expected**:
- 3 files created (2 item files + 1 entry file)
- Timer resets with each API call
- Single commit contains all 3 files
- Commit message shows "Add 3 files"

### Test 3: Cross-Clone Item Visibility via Pull
**Goal**: Verify item created in clone1 is visible in clone2 after pull

**Setup**:
- Create bare repo + 2 clones
- Create Sparkle instance in both clones
- Both clones initialized

**Steps**:
1. Clone1: `await sparkle1.createItem('Shared item', 'incomplete', 'Initial entry')`
2. Clone1: `await sparkle1.getItemDetails(itemId)` - verify item exists
3. Clone1: Wait for commit/push (6 seconds)
4. Clone2: Manually call `await sparkle2.gitOps.commitAndPush()` to trigger pull
5. Clone2: `await sparkle2.getItemDetails(itemId)` - should work now
6. Verify both clones return identical item data

**Expected**:
- Clone1 creates item and entry
- Clone1 aggregate built and cached
- Clone1 commits and pushes
- Clone2 pull detects new files
- Clone2 aggregate invalidated (doesn't exist yet, so no-op)
- Clone2 builds aggregate from events
- Both return same tagline, status, entries

### Test 4: Concurrent Entries Merge Correctly
**Goal**: Verify concurrent edits to same item merge via ORT strategy

**Setup**:
- Create bare repo + 2 clones
- Create Sparkle instances in both
- Clone1: Create item, wait for push
- Both clones pull to sync

**Steps**:
1. Clone1: `await sparkle1.addEntry(itemId, 'Entry from clone1')`
2. Clone2: `await sparkle2.addEntry(itemId, 'Entry from clone2')` (before clone1 pushes)
3. Clone1: Wait 6 seconds for commit/push
4. Clone2: Wait 6 seconds, then call `commitAndPush()` (will trigger retry)
5. Clone2: Verify retry loop pulls, merges, pushes
6. Clone1: Call `commitAndPush()` to pull latest
7. Both: `await sparkle.getItemDetails(itemId)`
8. Verify both clones see both entries

**Expected**:
- Clone1 creates entry file, commits, pushes
- Clone2 creates different entry file, commits
- Clone2 push fails, pulls, merges automatically
- Both entry files coexist (different filenames/timestamps)
- Clone2 pushes successfully
- Clone1 pulls and sees both entries
- Aggregates in both clones show 2 entries

### Test 5: Aggregate Invalidation After Pull
**Goal**: Verify pulling changes invalidates cached aggregates

**Setup**:
- Create bare repo + 2 clones
- Create Sparkle instances in both
- Clone1: Create item with entry, wait for push
- Clone2: Pull and read item (builds aggregate)

**Steps**:
1. Clone1: `await sparkle1.addEntry(itemId, 'New entry from clone1')`
2. Clone1: Wait 6 seconds for commit/push
3. Clone2: Read item before pull: `const before = await sparkle2.getItemDetails(itemId)`
4. Clone2: Verify `before.entries.length === 1` (initial entry only)
5. Clone2: Call `await sparkle2.gitOps.commitAndPush()` to trigger pull
6. Clone2: Read item after pull: `const after = await sparkle2.getItemDetails(itemId)`
7. Verify `after.entries.length === 2` (aggregate rebuilt with new entry)

**Expected**:
- Clone2 initially has cached aggregate with 1 entry
- Clone1 adds entry and pushes
- Clone2 pull detects changed file
- Clone2 invalidates aggregate for that itemId
- Clone2 next read rebuilds from all event files
- Clone2 now sees 2 entries

## Test Infrastructure

### Using Existing Helpers
The `test-helpers.js` already provides:
- `createTestEnvironment()` - Creates bare repo + N clones
- `installSparkle()` - Installs from tarball into clone
- `initializeSparkle()` - Sets up git worktree (sparkle branch)
- `startDaemon()` - Starts daemon (for setup only)
- `stopDaemon()` - Stops daemon
- `sleep()` - Wait for debounce timers
- `cleanupEnvironment()` - Cleanup after tests

### Test Approach
**Use daemon for setup, then test Sparkle class directly:**

1. **Setup Phase** (use existing helpers):
   - `createTestEnvironment()` - Create bare repo + clones
   - `installSparkle()` - Install tarball in each clone
   - `initializeSparkle()` - Set up git worktree architecture
   - `startDaemon()` - Start daemon to complete initialization
   - `stopDaemon()` - Shut down daemon immediately

2. **Test Phase** (import from node_modules):
   - Import: `const { Sparkle } = await import(pathToFileURL(sparkleClassPath).href)`
   - Path: `clone/node_modules/sparkle/src/sparkle-class.js`
   - Create Sparkle instance with worktree data directory
   - Test Sparkle API directly (no HTTP/daemon)
   - Verify git operations work correctly

### Why This Approach?
- **Reuses setup logic**: Daemon handles complex worktree initialization
- **Tests production code**: Sparkle class from installed package
- **No daemon overhead**: Direct Sparkle API calls, faster tests
- **Real architecture**: Tests actual git worktree structure
- **Isolation**: Daemon setup then killed, doesn't affect tests

### Build Process
1. `npm pack` - Creates `sparkle-<version>.tgz`
2. Integration tests install from this tarball
3. Daemon sets up worktree, then exits
4. Tests import from `node_modules/sparkle/`

## Test Execution Plan

### Step 1: Build Release
```bash
npm pack
```
Creates: `sparkle-1.0.151.tgz`

### Step 2: Create Test File
File: `tests/git-operations-integration.test.js`

Structure:
```javascript
import { createTestEnvironment, installSparkle, cleanupEnvironment, sleep } from './test-helpers.js';
import { Sparkle } from '../src/sparkle-class.js'; // For direct usage

// Test 1: Basic Git Operations
// Test 2: Debounced Commits
// Test 3: Pull and Aggregate Invalidation
// Test 4: Concurrent Edits
// Test 5: Retry Loop
```

### Step 3: Run Tests
```bash
node tests/git-operations-integration.test.js
```

### Step 4: Verify Results
- Check test output for pass/fail
- Inspect `.integration_testing/` directories for artifacts
- Verify git logs show expected commits
- Verify aggregates are correctly invalidated/rebuilt

## Success Criteria

All 5 tests must pass:
- ✅ Basic git operations work
- ✅ Debouncing works correctly
- ✅ Pull invalidates aggregates
- ✅ Concurrent edits merge cleanly
- ✅ Retry loop handles conflicts

## Notes

### Isolation from Daemon Tests
- These tests use Sparkle class directly (not daemon)
- No HTTP API calls
- No daemon startup/shutdown
- Independent test suite
- Won't affect existing daemon integration tests

### Timing Considerations
- Debounce timer is 5 seconds
- Need to wait for commits to complete
- Tests may take 30-60 seconds each
- Total test suite: ~5 minutes

### Git Configuration
- Each clone gets unique git identity
- Uses test email addresses
- Commits attributed correctly
- Merge strategy: ORT (automatic)

## Implementation Order

1. Build release package
2. Create basic test structure
3. Implement Test 1 (Basic Git Operations)
4. Run and debug Test 1
5. Implement Test 2 (Debouncing)
6. Implement Test 3 (Pull/Invalidation)
7. Implement Test 4 (Concurrent Edits)
8. Implement Test 5 (Retry Loop)
9. Run full suite
10. Document results
