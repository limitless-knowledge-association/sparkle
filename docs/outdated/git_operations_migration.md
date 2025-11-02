# Git Operations Migration - Module to Class

**Created**: 2025-10-25
**Status**: Planning → Implementation

## Problem Statement

Currently, git operations are handled through module-level functions spread across multiple files:
- `gitCommitScheduler.js` - Module-level timer and callback registration
- `gitBranchOps.js` - Module-level git utility functions
- `gitUtils.js` - Additional git helpers
- Event files directly call `scheduleOutboundGit()` after writing files

This creates several issues:
1. **No central coordination** - Event files schedule git operations independently
2. **No aggregate invalidation on pull** - Remote changes don't trigger aggregate updates
3. **Module-level state** - Hard to test, hard to manage lifecycle
4. **Tight coupling** - Event files are coupled to gitCommitScheduler module

## Goal

Migrate to a class-based `GitOperations` that:
1. Encapsulates all git logic in one place
2. Provides callbacks for pull notifications to invalidate aggregates
3. Is injected as a dependency (like AggregateModel)
4. Follows the MVC pattern established in the codebase

## Current Architecture (Module-Based)

### Event Creation Flow
```
User action
  ↓
SparkleClass.addEntry()
  ↓
entryController.addEntry(baseDirectory, itemId, text, aggregateModel)
  ↓
  ├→ entryEvent.createFile(directory, itemId, text, person)
  │    ├→ writeJsonFile() - writes event to disk
  │    └→ scheduleOutboundGit() - MODULE FUNCTION, debounces to 5 seconds
  └→ aggregateModel.updateAggregateForEvent(filename, eventData)
       └→ incremental update
```

### Git Commit Flow (sparkle_agent.js)
```
setSchedulerCallback(() => performCommitAndFetch())
  ↓
scheduleOutboundGit() called by event file
  ↓
After 5 seconds, timer fires
  ↓
performCommitAndFetch() - in sparkle_agent.js
  ├→ git fetch
  ├→ git pull --no-edit
  ├→ git add *.json
  ├→ git commit
  └→ git push (with retry loop for conflicts)
       ├→ On conflict: fetch + merge + retry
       └→ Exponential backoff
```

**Problem**: No aggregate invalidation after `git pull`!

## New Architecture (Class-Based)

### Event Creation Flow
```
User action
  ↓
SparkleClass.addEntry()
  ↓
entryController.addEntry(baseDirectory, itemId, text, aggregateModel, gitOps)
  ↓
  ├→ entryEvent.createFile(directory, itemId, text, person)
  │    ├→ writeJsonFile() - writes event to disk
  │    └→ RETURNS filename (no longer calls scheduleOutboundGit)
  ├→ aggregateModel.updateAggregateForEvent(filename, eventData)
  │    └→ incremental update
  └→ gitOps.notifyFileCreated(filename) - NEW
       └→ schedules commit+push
```

### Git Commit Flow
```
GitOperations instance (injected into SparkleClass)
  ↓
gitOps.notifyFileCreated(filename) - called by controller
  ↓
Debounced 5-second timer
  ↓
gitOps.commitAndPush()
  ├→ git fetch
  ├→ git pull --no-edit
  │    └→ Parse changed files
  │         └→ gitOps._notifyFilesPulled(changedFiles) - NEW
  │              └→ aggregateModel.invalidateAggregatesForFiles(files)
  ├→ git add *.json
  ├→ git commit
  └→ git push (with retry loop)
```

## GitOperations Class Design

### Properties
```javascript
class GitOperations {
  constructor(baseDirectory, aggregateModel) {
    this.baseDirectory = baseDirectory;
    this.aggregateModel = aggregateModel;
    this.commitTimer = null;
    this.pendingFiles = new Set();
  }
}
```

### Methods

#### File Creation Notification
```javascript
notifyFileCreated(filename)
```
- Called by controllers after event file is written
- Adds filename to pending set
- Schedules commit (debounced to 5 seconds)

#### Commit and Push
```javascript
async commitAndPush()
```
- Fetch from remote
- Pull and parse changed files
- Call `_notifyFilesPulled(changedFiles)` to invalidate aggregates
- Stage pending files
- Commit with message
- Push with retry loop (up to 5 attempts)
- On conflict: fetch + merge + retry with exponential backoff

#### Pull Notification (Private)
```javascript
_notifyFilesPulled(changedFiles)
```
- Parse changed filenames to extract itemIds
- For each affected itemId, invalidate aggregate
- AggregateModel will rebuild on next access

#### Utility Methods
```javascript
_parseChangedFiles(gitOutput) - Extract filenames from git pull output
_extractItemIdsFromFilenames(files) - Parse itemIds from event filenames
_scheduleCommit() - Start/reset 5-second timer
```

## Migration Steps

### Step 1: Enhance GitOperations Class
- ✅ Already exists at `src/GitOperations.js`
- ✅ Already has `_extractItemIdsFromFilename()` and `_extractAllItemIds()`
- ✅ Already has `pull()` method with change detection
- Add: `notifyFileCreated(filename)` method
- Add: `commitAndPush()` method (migrate from performCommitAndFetch)
- Add: Debounced commit timer
- Add: Constructor takes `aggregateModel` for invalidation

### Step 2: Update Controllers
Add `gitOps` parameter to all controller methods:
- ✅ itemController.createItem(baseDir, ..., aggregateModel, **gitOps**)
- ✅ entryController.addEntry(baseDir, ..., aggregateModel, **gitOps**)
- ✅ taglineController.alterTagline(baseDir, ..., aggregateModel, **gitOps**)
- ✅ statusController.updateStatus(baseDir, ..., aggregateModel, **gitOps**)
- ✅ dependencyController.addDependency(baseDir, ..., aggregateModel, **gitOps**)
- ✅ dependencyController.removeDependency(baseDir, ..., aggregateModel, **gitOps**)
- ✅ monitorController.addMonitor(baseDir, ..., aggregateModel, **gitOps**)
- ✅ monitorController.removeMonitor(baseDir, ..., aggregateModel, **gitOps**)
- ✅ ignoredController.ignoreItem(baseDir, ..., aggregateModel, **gitOps**)
- ✅ ignoredController.unignoreItem(baseDir, ..., aggregateModel, **gitOps**)
- ✅ takenController.takeItem(baseDir, ..., aggregateModel, **gitOps**)
- ✅ takenController.surrenderItem(baseDir, ..., aggregateModel, **gitOps**)

Pattern:
```javascript
export async function addEntry(baseDirectory, itemId, text, aggregateModel = null, gitOps = null) {
  // Business logic...

  const filename = await entryEvent.createFile(baseDirectory, itemId, text, person);

  // Update aggregate
  if (aggregateModel) {
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git (NEW)
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}
```

### Step 3: Update Event Files
Remove `scheduleOutboundGit()` calls from event files:
- src/events/item.js
- src/events/entry.js
- src/events/tagline.js
- src/events/status.js
- src/events/dependency.js
- src/events/monitor.js
- src/events/ignored.js
- src/events/taken.js

Change from:
```javascript
await writeJsonFile(filePath, data);
scheduleOutboundGit().catch(err => ...);
return filename;
```

To:
```javascript
await writeJsonFile(filePath, data);
return filename; // Controller will notify gitOps
```

### Step 4: Update SparkleClass
Add GitOperations instance and pass to controllers:

```javascript
class Sparkle {
  constructor(baseDirectory) {
    this.baseDirectory = baseDirectory;
    this.aggregateModel = null;
    this.gitOps = null; // NEW
    this.initialized = false;
  }

  async start() {
    await this.aggregateModel.start();
    this.gitOps = new GitOperations(this.baseDirectory, this.aggregateModel);
    await this.gitOps.initialize(); // Setup git config, worktree, etc.
  }

  async addEntry(itemId, text) {
    await entryController.addEntry(
      this.baseDirectory,
      itemId,
      text,
      this.aggregateModel,
      this.gitOps  // NEW
    );
  }
}
```

### Step 5: Update AggregateModel
Add method to invalidate aggregates for pulled files:

```javascript
async invalidateAggregatesForFiles(filenames) {
  const itemIds = new Set();

  for (const filename of filenames) {
    const ids = this._extractItemIdsFromFilename(filename);
    ids.forEach(id => itemIds.add(id));
  }

  console.log(`[AggregateModel] Invalidating ${itemIds.size} aggregates from ${filenames.length} pulled files`);

  for (const itemId of itemIds) {
    await this.invalidateAggregate(itemId);
  }
}
```

### Step 6: Migrate performCommitAndFetch Logic
Move logic from `bin/sparkle_agent.js:performCommitAndFetch()` into `GitOperations.commitAndPush()`:
- Preserve the fetch → pull → add → commit → push flow
- Preserve retry loop with exponential backoff
- Preserve conflict resolution with ORT merge
- Add: Parse pull output to detect changed files
- Add: Call `aggregateModel.invalidateAggregatesForFiles()`

### Step 7: Update sparkle_agent.js
Instead of module-level `setSchedulerCallback()`:

```javascript
// OLD
setSchedulerCallback(async () => {
  await performCommitAndFetch();
});

// NEW
sparkle.gitOps.startAutoCommit(); // Start background timer if needed
```

### Step 8: Deprecate Old Modules
Mark for future removal:
- `src/gitCommitScheduler.js` - Replaced by GitOperations timer
- Module exports from gitBranchOps can stay as utilities, but main logic moves to GitOperations

## Testing Strategy

### Unit Tests
1. Test GitOperations.notifyFileCreated() debounces correctly
2. Test GitOperations.commitAndPush() retry loop
3. Test aggregate invalidation on pull

### Integration Tests
1. Clone1 creates item → Clone2 pulls → Verify aggregate exists
2. Clone1 modifies item → Clone2 pulls → Verify aggregate updated
3. Conflict scenario → Verify ORT merge resolves → Both clones have correct data

### Metrics Verification
After pull that brings new files:
```
[GitOperations] Pull completed: 3 files, 2 items affected (45ms)
[AggregateModel] Invalidating 2 aggregates from 3 pulled files
[Aggregate] rebuildAggregate(12345678) - type: full_rebuild, filesRead: 5, duration: 12ms
[Aggregate] rebuildAggregate(87654321) - type: full_rebuild, filesRead: 3, duration: 8ms
```

## Benefits

1. **Aggregate Consistency**: Pulled files automatically invalidate affected aggregates
2. **Testability**: GitOperations is a class that can be mocked/injected
3. **Single Responsibility**: Controllers orchestrate all side effects
4. **Cleaner Dependencies**: No module-level state or global callbacks
5. **Lifecycle Management**: GitOperations can be started/stopped/cleaned up
6. **Metrics**: Git operations can track and report performance

## Backward Compatibility

During migration:
- Event files still work (they return filename, controllers handle notification)
- Old tests still work (gitOps parameter is optional)
- Can enable/disable GitOperations with feature flag if needed

## Success Criteria

✅ All 82 tests pass
✅ Git pull invalidates affected aggregates
✅ Git commit/push retry logic works
✅ No module-level state in gitCommitScheduler
✅ Controllers uniformly handle aggregate + git notifications
✅ Metrics show aggregate rebuilds after pull

## Implementation Order

1. Enhance GitOperations class with commit/push logic
2. Update all controllers to accept and use gitOps
3. Update SparkleClass to create and pass GitOperations
4. Remove scheduleOutboundGit() calls from event files
5. Update sparkle_agent.js to use GitOperations
6. Test with integration tests
7. Verify metrics show proper invalidation
8. Mark old modules as deprecated

## Files to Modify

### Create/Enhance
- [x] `src/GitOperations.js` - Add commit/push logic
- [ ] Update all controllers (12 methods)
- [ ] `src/sparkle-class.js` - Add gitOps instance
- [ ] `src/AggregateModel.js` - Add invalidateAggregatesForFiles()

### Modify
- [ ] All event files (8 files) - Remove scheduleOutboundGit()
- [ ] `bin/sparkle_agent.js` - Use GitOperations instead of setSchedulerCallback

### Deprecate (Future)
- `src/gitCommitScheduler.js` - Once fully migrated
