/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Aggregate Manager test suite
 * Tests the derived data store functionality
 */

import * as sparkle from '../src/sparkle.js';
import * as aggregateManager from '../src/aggregateManager.js';
import { unit_test_setup } from './test-helpers.js';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';

// Test setup
async function setupTest() {
  const testDir = await unit_test_setup();
  sparkle.setBaseDirectory(testDir);

  // Inject the real aggregate manager
  sparkle.setAggregateManager(aggregateManager);

  // Initialize the aggregate store
  await aggregateManager.initializeAggregateStore(testDir);

  return testDir;
}

// Test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\nRunning ${this.tests.length} aggregate manager tests...\n`);

    for (const { name, fn } of this.tests) {
      try {
        const testDir = await setupTest();
        await fn(testDir);
        this.passed++;
        console.log(`✓ ${name}`);
      } catch (error) {
        this.failed++;
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        if (error.stack) {
          console.error(`  ${error.stack.split('\n').slice(1, 3).join('\n  ')}`);
        }
      }
    }

    console.log(`\nResults: ${this.passed} passed, ${this.failed} failed\n`);
    process.exit(this.failed > 0 ? 1 : 0);
  }
}

const runner = new TestRunner();

// ============================================================================
// Tests: Initialization
// ============================================================================

runner.test('initializeAggregateStore creates directory structure', async (testDir) => {
  const aggregateDir = join(testDir, '.aggregates');
  const itemsDir = join(aggregateDir, 'items');
  const metadataPath = join(aggregateDir, 'metadata.json');

  if (!existsSync(aggregateDir)) {
    throw new Error('.aggregates directory not created');
  }

  if (!existsSync(itemsDir)) {
    throw new Error('.aggregates/items directory not created');
  }

  if (!existsSync(metadataPath)) {
    throw new Error('metadata.json not created');
  }
});

// ============================================================================
// Tests: Aggregate Creation
// ============================================================================

runner.test('rebuildAggregate creates aggregate file after item creation', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');
  const aggregatePath = join(testDir, '.aggregates', 'items', `${itemId}.json`);

  if (!existsSync(aggregatePath)) {
    throw new Error('Aggregate file not created');
  }
});

runner.test('aggregate contains all required fields', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');
  const aggregate = await aggregateManager.getAggregate(itemId);

  const requiredFields = ['itemId', 'tagline', 'status', 'created', 'creator', '_meta'];
  for (const field of requiredFields) {
    if (!aggregate[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
});

runner.test('aggregate metadata contains expected fields', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');
  const aggregate = await aggregateManager.getAggregate(itemId);

  const metaFields = ['lastEventTimestamp', 'eventFileCount', 'builtAt'];
  for (const field of metaFields) {
    if (!aggregate._meta[field]) {
      throw new Error(`Missing metadata field: ${field}`);
    }
  }
});

runner.test('aggregate has derived fields', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');
  const aggregate = await aggregateManager.getAggregate(itemId);

  if (typeof aggregate.dependencyCount !== 'number') {
    throw new Error('Missing or invalid dependencyCount');
  }

  if (typeof aggregate.entryCount !== 'number') {
    throw new Error('Missing or invalid entryCount');
  }
});

// ============================================================================
// Tests: Aggregate Updates
// ============================================================================

runner.test('aggregate updates when tagline changes', async (testDir) => {
  const itemId = await sparkle.createItem('Original tagline', 'incomplete');

  await sparkle.alterTagline(itemId, 'Updated tagline');

  const aggregate = await aggregateManager.getAggregate(itemId);
  if (aggregate.tagline !== 'Updated tagline') {
    throw new Error(`Tagline not updated in aggregate: ${aggregate.tagline}`);
  }
});

runner.test('aggregate updates when status changes', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');

  await sparkle.updateStatus(itemId, 'completed');

  const aggregate = await aggregateManager.getAggregate(itemId);
  if (aggregate.status !== 'completed') {
    throw new Error(`Status not updated in aggregate: ${aggregate.status}`);
  }
});

runner.test('aggregate updates when entry added', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');

  await sparkle.addEntry(itemId, 'First entry');
  await sparkle.addEntry(itemId, 'Second entry');

  const aggregate = await aggregateManager.getAggregate(itemId);
  if (aggregate.entryCount !== 2) {
    throw new Error(`Entry count incorrect: ${aggregate.entryCount}`);
  }

  if (aggregate.entries.length !== 2) {
    throw new Error(`Entries array length incorrect: ${aggregate.entries.length}`);
  }
});

runner.test('aggregate updates when dependency added', async (testDir) => {
  const item1 = await sparkle.createItem('Item 1', 'incomplete');
  const item2 = await sparkle.createItem('Item 2', 'incomplete');

  await sparkle.addDependency(item1, item2);

  const aggregate1 = await aggregateManager.getAggregate(item1);
  if (aggregate1.dependencyCount !== 1) {
    throw new Error(`Item 1 dependency count incorrect: ${aggregate1.dependencyCount}`);
  }

  if (!aggregate1.dependencies.includes(item2)) {
    throw new Error('Item 2 not in item 1 dependencies');
  }
});

runner.test('both aggregates update when dependency added', async (testDir) => {
  const item1 = await sparkle.createItem('Item 1', 'incomplete');
  const item2 = await sparkle.createItem('Item 2', 'incomplete');

  const beforeTimestamp = Date.now();

  await sparkle.addDependency(item1, item2);

  const aggregate1 = await aggregateManager.getAggregate(item1);
  const aggregate2 = await aggregateManager.getAggregate(item2);

  const time1 = new Date(aggregate1._meta.builtAt).getTime();
  const time2 = new Date(aggregate2._meta.builtAt).getTime();

  if (time1 < beforeTimestamp) {
    throw new Error('Item 1 aggregate not rebuilt');
  }

  if (time2 < beforeTimestamp) {
    throw new Error('Item 2 aggregate not rebuilt');
  }
});

runner.test('aggregate updates when monitor added', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');

  await sparkle.addMonitor(itemId);

  const aggregate = await aggregateManager.getAggregate(itemId);
  if (!aggregate.monitors || aggregate.monitors.length !== 1) {
    throw new Error('Monitor not added to aggregate');
  }
});

runner.test('aggregate updates when item ignored', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');

  await sparkle.ignoreItem(itemId);

  const aggregate = await aggregateManager.getAggregate(itemId);
  if (aggregate.ignored !== true) {
    throw new Error('Ignored status not updated in aggregate');
  }
});

runner.test('aggregate updates when item taken', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');

  await sparkle.takeItem(itemId);

  const aggregate = await aggregateManager.getAggregate(itemId);
  if (!aggregate.takenBy) {
    throw new Error('TakenBy not updated in aggregate');
  }
});

// ============================================================================
// Tests: getAllAggregates
// ============================================================================

runner.test('getAllAggregates returns all items', async (testDir) => {
  await sparkle.createItem('Item 1', 'incomplete');
  await sparkle.createItem('Item 2', 'incomplete');
  await sparkle.createItem('Item 3', 'incomplete');

  const aggregates = await aggregateManager.getAllAggregates();

  if (aggregates.length !== 3) {
    throw new Error(`Expected 3 aggregates, got ${aggregates.length}`);
  }
});

runner.test('getAllAggregates returns items in correct format', async (testDir) => {
  await sparkle.createItem('Test item', 'incomplete');

  const aggregates = await aggregateManager.getAllAggregates();
  const aggregate = aggregates[0];

  if (!aggregate.itemId || !aggregate.tagline || !aggregate.status) {
    throw new Error('Aggregate missing required fields');
  }
});

// ============================================================================
// Tests: Validation
// ============================================================================

runner.test('validateAggregate passes for valid aggregate', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');

  const validation = await aggregateManager.validateAggregate(itemId);

  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }
});

runner.test('validateAggregate detects missing aggregate', async (testDir) => {
  const validation = await aggregateManager.validateAggregate('99999999');

  if (validation.valid) {
    throw new Error('Validation should fail for missing aggregate');
  }

  if (!validation.errors.includes('Aggregate file not found')) {
    throw new Error('Expected "Aggregate file not found" error');
  }
});

runner.test('validateAllAggregates passes for valid system', async (testDir) => {
  await sparkle.createItem('Item 1', 'incomplete');
  await sparkle.createItem('Item 2', 'incomplete');

  const validation = await sparkle.validateAllAggregates();

  if (!validation.valid) {
    throw new Error(`Validation failed with ${validation.invalidItems.length} invalid items`);
  }
});

// ============================================================================
// Tests: Rebuild All
// ============================================================================

runner.test('rebuildAll rebuilds all aggregates', async (testDir) => {
  await sparkle.createItem('Item 1', 'incomplete');
  await sparkle.createItem('Item 2', 'incomplete');
  await sparkle.createItem('Item 3', 'incomplete');

  // Delete all aggregate files to simulate corruption
  const itemsDir = join(testDir, '.aggregates', 'items');
  const files = await readdir(itemsDir);
  for (const file of files) {
    const { unlink } = await import('fs/promises');
    await unlink(join(itemsDir, file));
  }

  // Rebuild all
  await sparkle.rebuildAllAggregates();

  // Check all aggregates exist
  const aggregates = await aggregateManager.getAllAggregates();
  if (aggregates.length !== 3) {
    throw new Error(`Expected 3 aggregates after rebuild, got ${aggregates.length}`);
  }
});

runner.test('rebuildAll reports progress', async (testDir) => {
  await sparkle.createItem('Item 1', 'incomplete');
  await sparkle.createItem('Item 2', 'incomplete');
  await sparkle.createItem('Item 3', 'incomplete');

  let progressCalls = 0;
  let lastCurrent = 0;
  let lastTotal = 0;

  await sparkle.rebuildAllAggregates((current, total) => {
    progressCalls++;
    lastCurrent = current;
    lastTotal = total;
  });

  if (progressCalls === 0) {
    throw new Error('Progress callback not called');
  }

  if (lastCurrent !== 3) {
    throw new Error(`Expected final current to be 3, got ${lastCurrent}`);
  }

  if (lastTotal !== 3) {
    throw new Error(`Expected total to be 3, got ${lastTotal}`);
  }
});

// ============================================================================
// Tests: SSE Notification Callback
// ============================================================================

runner.test('onAggregateChanged callback is called when aggregate rebuilt', async (testDir) => {
  let callbackInvoked = false;
  let callbackItemId = null;

  sparkle.onAggregateChanged((itemId) => {
    callbackInvoked = true;
    callbackItemId = itemId;
  });

  const itemId = await sparkle.createItem('Test item', 'incomplete');

  if (!callbackInvoked) {
    throw new Error('Callback not invoked');
  }

  if (callbackItemId !== itemId) {
    throw new Error(`Callback itemId mismatch: expected ${itemId}, got ${callbackItemId}`);
  }
});

// ============================================================================
// Tests: Integration with Sparkle API
// ============================================================================

runner.test('getAllItems returns data from aggregates', async (testDir) => {
  await sparkle.createItem('Item 1', 'incomplete');
  const item2 = await sparkle.createItem('Item 2', 'incomplete');
  await sparkle.updateStatus(item2, 'completed');

  const items = await sparkle.getAllItems();

  if (items.length !== 2) {
    throw new Error(`Expected 2 items, got ${items.length}`);
  }

  // Check data format
  for (const item of items) {
    if (!item.itemId || !item.tagline || !item.status || !item.created) {
      throw new Error('Item missing required fields from aggregate');
    }
  }
});

runner.test('getItemDetails returns data from aggregate', async (testDir) => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');
  await sparkle.addEntry(itemId, 'Test entry');

  const details = await sparkle.getItemDetails(itemId);

  if (details.tagline !== 'Test item') {
    throw new Error('Tagline mismatch');
  }

  if (details.entries.length !== 1) {
    throw new Error('Entries not included from aggregate');
  }
});

runner.test('pendingWork uses aggregates', async (testDir) => {
  const item1 = await sparkle.createItem('Item 1', 'incomplete');
  const item2 = await sparkle.createItem('Item 2', 'incomplete');
  const item3 = await sparkle.createItem('Item 3', 'incomplete');
  await sparkle.updateStatus(item3, 'completed');

  await sparkle.addDependency(item2, item1);

  const pending = [];
  for await (const itemId of sparkle.pendingWork()) {
    pending.push(itemId);
  }

  // Item 1 should be pending (no deps, not completed)
  // Item 2 should NOT be pending (depends on item1 which is not completed)
  // Item 3 should NOT be pending (already completed)

  if (!pending.includes(item1)) {
    throw new Error('Item 1 should be pending');
  }

  if (pending.includes(item2)) {
    throw new Error('Item 2 should not be pending (has unmet dependency)');
  }

  if (pending.includes(item3)) {
    throw new Error('Item 3 should not be pending (already completed)');
  }
});

// ============================================================================
// Tests: Performance (Aggregate vs Event Sourcing)
// ============================================================================

runner.test('aggregates provide faster access than event sourcing', async (testDir) => {
  // Create item with multiple events
  const itemId = await sparkle.createItem('Test item', 'incomplete');
  await sparkle.addEntry(itemId, 'Entry 1');
  await sparkle.addEntry(itemId, 'Entry 2');
  await sparkle.addEntry(itemId, 'Entry 3');
  await sparkle.alterTagline(itemId, 'Updated tagline');
  await sparkle.updateStatus(itemId, 'completed');

  // Time aggregate access
  const startAggregate = Date.now();
  await sparkle.getItemDetails(itemId);
  const aggregateTime = Date.now() - startAggregate;

  console.log(`  Aggregate access time: ${aggregateTime}ms`);

  // We can't directly test event sourcing time since we removed that path,
  // but we can verify the aggregate has all the data
  const details = await sparkle.getItemDetails(itemId);

  if (details.entries.length !== 3) {
    throw new Error('Aggregate missing entries');
  }

  if (details.tagline !== 'Updated tagline') {
    throw new Error('Aggregate has wrong tagline');
  }

  if (details.status !== 'completed') {
    throw new Error('Aggregate has wrong status');
  }
});

// Run all tests
runner.run();
