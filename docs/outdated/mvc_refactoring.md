# MVC Architecture Refactoring

## Overview

Refactoring Sparkle to follow a clean MVC pattern where:
- **Sparkle (View/Interface)** - Public API, minimal validation, delegates to Controllers
- **Controllers** - Business logic, validation, write events, tell AggregateModel to update
- **AggregateModel (Model)** - Data layer, reads events, maintains aggregates

## Key Principle

**Controllers write events → AggregateModel reads events and maintains aggregates**

This means:
1. Controllers use event modules (e.g., `itemEvent.createFile()`) to write event files
2. Controllers call `aggregateModel.updateAggregateForEvent(filename, eventData)`
3. AggregateModel reads events and updates aggregates (incrementally in the future)
4. SparkleClass does NOT call `rebuildAggregate()` - that's now internal to AggregateModel

## New Method: `updateAggregateForEvent(filename, eventData)`

```javascript
/**
 * Update aggregates affected by an event
 * @param {string} eventFilename - Event file (e.g., "12345678.entry.20250101.abc.json")
 * @param {Object} eventData - Optional event data (if provided, skips file reading)
 */
async updateAggregateForEvent(eventFilename, eventData = null)
```

**Purpose**:
- When controller writes event: `updateAggregateForEvent(filename, data)` - uses data, skips file read
- When git pull happens: `updateAggregateForEvent(filename)` - reads file since data not provided

**Benefits**:
- Single method for both local changes and remote pulls
- Controllers provide data for performance (skip file I/O)
- Git pull can just provide filename (reads file to get data)

## Architecture Flow

### Creating an Item (Example)

**Before (incorrect)**:
```
SparkleClass.createItem()
  → itemController.createItem() (writes event)
  → SparkleClass calls aggregateModel.rebuildAggregate() (rebuilds from scratch!)
```

**After (correct)**:
```
SparkleClass.createItem(tagline, status, initialEntry)
  → validates: status exists in statuses.json (if needed)
  → itemController.createItem(baseDirectory, tagline, status, initialEntry, aggregateModel)
    → validates: tagline not empty, status != 'completed'
    → writes event: filename = itemEvent.createFile(...)
    → aggregateModel.updateAggregateForEvent(filename, eventData)
      → extracts itemIds from filename
      → _updateAggregateIncremental(itemId, filename, eventData)
        → (currently rebuilds, TODO: incremental update)
```

### Adding a Dependency (Example)

**Pattern**: Dependency events affect TWO items
```
SparkleClass.addDependency(itemNeeding, itemNeeded)
  → validates: both items exist
  → dependencyController.addDependency(baseDirectory, itemNeeding, itemNeeded, aggregateModel)
    → validates: no circular dependency
    → writes event: filename = dependencyEvent.createLinkFile(...)
      → returns "15856117.dependency.linked.31795000.timestamp.random.json"
    → aggregateModel.updateAggregateForEvent(filename, eventData)
      → extracts: [15856117, 31795000]
      → updates BOTH aggregates
```

## Refactoring Checklist

### ✅ Completed

1. **AggregateModel** - Added `updateAggregateForEvent(filename, eventData)`
2. **ItemController.createItem()** - Updated to accept aggregateModel, call updateAggregateForEvent
3. **SparkleClass.createItem()** - Updated to pass aggregateModel, removed rebuildAggregate call

### ✅ Completed - Controllers

All controllers have been updated to:
1. Accept `aggregateModel` parameter
2. Get `filename` from event creation
3. Call `aggregateModel.updateAggregateForEvent(filename, eventData)` after writing event

#### Controllers Updated:

- [x] **taglineController.js** - `alterTagline()`
- [x] **entryController.js** - `addEntry()`
- [x] **statusController.js** - `updateStatus()`
- [x] **dependencyController.js** - `addDependency()`, `removeDependency()`
- [x] **monitorController.js** - `addMonitor()`, `removeMonitor()`
- [x] **ignoredController.js** - `ignoreItem()`, `unignoreItem()`
- [x] **takenController.js** - `takeItem()`, `surrenderItem()`

### ✅ Completed - SparkleClass Methods

All methods have been updated to:
1. Pass `this.aggregateModel` to controller
2. Remove `await this.aggregateModel.rebuildAggregate()` calls

#### SparkleClass Methods Updated:

- [x] **createItem()** - DONE
- [x] **alterTagline()**
- [x] **addEntry()**
- [x] **updateStatus()**
- [x] **addDependency()** - affects 2 aggregates
- [x] **removeDependency()** - affects 2 aggregates
- [x] **addMonitor()**
- [x] **removeMonitor()**
- [x] **ignoreItem()**
- [x] **unignoreItem()**
- [x] **takeItem()**
- [x] **surrenderItem()**

### 📋 TODO - Event Modules

Verify that all event modules return the filename:

- [x] **item.js** - `createFile()` returns filename
- [ ] **tagline.js** - `createFile()` - check if returns filename
- [ ] **entry.js** - `createFile()` - check if returns filename
- [ ] **status.js** - `createFile()` - check if returns filename
- [ ] **dependency.js** - `createLinkFile()`, `createUnlinkFile()` - check if return filename
- [ ] **monitor.js** - `createAddFile()`, `createRemoveFile()` - check if return filename
- [ ] **ignored.js** - `createSetFile()`, `createClearFile()` - check if return filename
- [ ] **taken.js** - `createTakeFile()`, `createSurrenderFile()` - check if return filename

### 📋 TODO - GitOperations Integration

Hook up GitOperations to call AggregateModel when pull brings changes:

- [ ] Create GitOperations instance in Sparkle/daemon
- [ ] Register callback: `gitOps.onItemIdWasPulled((itemId) => aggregateModel.invalidateAggregate(itemId))`
- [ ] OR: Parse pulled files and call `aggregateModel.updateAggregateForEvent(filename)` for each

### 📋 TODO - Incremental Updates

Currently `_updateAggregateIncremental()` just calls `rebuildAggregate()`.

Future optimization: Parse filename and eventData to update aggregate incrementally:
- Entry event → push to entries array
- Status event → update status field
- Dependency link → add to dependencies/dependents arrays
- Tagline event → update tagline field
- etc.

## Testing Strategy

1. **Unit Tests** - Should continue to pass with refactoring (82 tests)
2. **CLI Tests** - Should continue to pass (13 tests)
3. **Integration Tests** - Test git pull scenario

## File Locations

- **AggregateModel**: `/Users/brianj/git/hrsi/sparkle/src/AggregateModel.js`
- **SparkleClass**: `/Users/brianj/git/hrsi/sparkle/src/sparkle-class.js`
- **Controllers**: `/Users/brianj/git/hrsi/sparkle/src/controllers/`
- **Events**: `/Users/brianj/git/hrsi/sparkle/src/events/`
- **GitOperations**: `/Users/brianj/git/hrsi/sparkle/src/GitOperations.js`

## Progress Tracking

**Last Updated**: 2025-10-25

**Current Status**:
- ✅ Architecture designed
- ✅ AggregateModel.updateAggregateForEvent() implemented
- ✅ ALL 7 controllers updated (item, entry, tagline, status, dependency, monitor, ignored, taken)
- ✅ ALL 12 SparkleClass methods updated
- ✅ All 82 tests passing with complete refactoring!
- ✅ MVC architecture fully implemented
- ✅ SparkleClass no longer calls rebuildAggregate directly

**✅ REFACTORING COMPLETE**: The MVC architecture is now fully implemented. Controllers write events and tell AggregateModel to update. SparkleClass delegates to controllers and passes aggregateModel. All rebuildAggregate calls have been removed from SparkleClass.

**Next Steps** (Future Optimizations):
1. ✅ ~~Update all controllers and SparkleClass methods~~ - COMPLETE
2. ✅ ~~Verify all 82 tests pass~~ - COMPLETE
3. Implement true incremental updates in `_updateAggregateIncremental()` (currently still rebuilds)
4. Hook up GitOperations to AggregateModel for selective invalidation on pull
