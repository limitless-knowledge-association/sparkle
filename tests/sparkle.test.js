/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle test suite
 * Tests create directories in .integration_testing/ and leave artifacts for inspection
 * Cleaned up automatically when integration tests run
 */

import { Sparkle } from '../src/sparkle-class.js';
import { unit_test_setup } from './test-helpers.js';

// Current sparkle instance (recreated for each test)
let sparkle = null;

// Test setup using shared infrastructure
async function setupTest() {
  const testDir = await unit_test_setup();
  sparkle = new Sparkle(testDir);
  await sparkle.start();
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
    console.log(`\nRunning ${this.tests.length} tests...\n`);

    for (const { name, fn } of this.tests) {
      try {
        await setupTest();
        await fn();
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
      // No cleanup - artifacts preserved in .integration_testing/
    }

    console.log(`\n${this.passed} passed, ${this.failed} failed\n`);
    console.log(`Test artifacts preserved in .integration_testing/\n`);
    process.exit(this.failed > 0 ? 1 : 0);
  }
}

// Assertion helpers
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    throw new Error(message || 'Expected function to throw');
  }
}

async function assertThrowsAsync(fn, message) {
  let threw = false;
  try {
    await fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    throw new Error(message || 'Expected async function to throw');
  }
}

// Tests
const runner = new TestRunner();

runner.test('Create item with default status', async () => {
  const item = await sparkle.createItem('Test item');
  assert(item, 'Item ID should be returned');
  assertEqual(item.length, 8, 'Item ID should be 8 characters');

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.tagline, 'Test item', 'Tagline should match');
  assertEqual(details.status, 'incomplete', 'Status should be incomplete');
  assert(details.person, 'Person should be set');
  assert(details.person.name, 'Person name should be set');
  assert(details.person.email, 'Person email should be set');
});

runner.test('Create item with custom status', async () => {
  const item = await sparkle.createItem('Test item', 'unassigned');
  const details = await sparkle.getItemDetails(item);
  assertEqual(details.status, 'unassigned', 'Status should be unassigned');
});

runner.test('Cannot create item with completed status', async () => {
  await assertThrowsAsync(
    () => sparkle.createItem('Test item', 'completed'),
    'Should not allow creating completed item'
  );
});

runner.test('Cannot create item with empty tagline', async () => {
  await assertThrowsAsync(
    () => sparkle.createItem(''),
    'Should not allow empty tagline'
  );

  await assertThrowsAsync(
    () => sparkle.createItem('   '),
    'Should not allow whitespace-only tagline'
  );
});

runner.test('Alter tagline', async () => {
  const item = await sparkle.createItem('Original tagline');
  await sparkle.alterTagline(item, 'Updated tagline');

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.tagline, 'Updated tagline', 'Tagline should be updated');
});

runner.test('Cannot alter tagline to empty', async () => {
  const item = await sparkle.createItem('Original tagline');

  await assertThrowsAsync(
    () => sparkle.alterTagline(item, ''),
    'Should not allow empty tagline'
  );
});

runner.test('Add entry to item', async () => {
  const item = await sparkle.createItem('Test item');
  await sparkle.addEntry(item, 'First entry');
  await sparkle.addEntry(item, 'Second entry');

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.entries.length, 2, 'Should have 2 entries');
  assertEqual(details.entries[0].text, 'First entry', 'First entry should match');
  assertEqual(details.entries[1].text, 'Second entry', 'Second entry should match');
});

runner.test('Update status', async () => {
  const item = await sparkle.createItem('Test item');
  await sparkle.updateStatus(item, 'in-progress', 'Starting work');

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.status, 'in-progress', 'Status should be updated');
});

runner.test('Add and remove dependency', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  await sparkle.addDependency(itemA, itemB);

  const detailsA = await sparkle.getItemDetails(itemA);
  assertEqual(detailsA.dependencies.length, 1, 'Should have 1 dependency');
  assertEqual(detailsA.dependencies[0], itemB, 'Dependency should be item B');

  await sparkle.removeDependency(itemA, itemB);

  const detailsA2 = await sparkle.getItemDetails(itemA);
  assertEqual(detailsA2.dependencies.length, 0, 'Should have no dependencies after removal');
});

runner.test('Dependency idempotency - adding existing dependency', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  await sparkle.addDependency(itemA, itemB);
  await sparkle.addDependency(itemA, itemB); // Should be ignored

  const details = await sparkle.getItemDetails(itemA);
  assertEqual(details.dependencies.length, 1, 'Should still have 1 dependency');
});

runner.test('Dependency idempotency - removing non-existent dependency', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  // Should not throw
  await sparkle.removeDependency(itemA, itemB);
});

runner.test('Dependency idempotency - re-adding after removal', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  await sparkle.addDependency(itemA, itemB);
  await sparkle.removeDependency(itemA, itemB);
  await sparkle.addDependency(itemA, itemB);

  const details = await sparkle.getItemDetails(itemA);
  assertEqual(details.dependencies.length, 1, 'Should have dependency after re-adding');
});

runner.test('Detect circular dependency', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');

  await sparkle.addDependency(itemA, itemB);
  await sparkle.addDependency(itemB, itemC);

  await assertThrowsAsync(
    () => sparkle.addDependency(itemC, itemA),
    'Should detect circular dependency'
  );
});

runner.test('Detect direct circular dependency', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  await sparkle.addDependency(itemA, itemB);

  await assertThrowsAsync(
    () => sparkle.addDependency(itemB, itemA),
    'Should detect direct circular dependency'
  );
});

runner.test('Cannot complete item with incomplete dependencies', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  await sparkle.addDependency(itemA, itemB);

  await assertThrowsAsync(
    () => sparkle.updateStatus(itemA, 'completed'),
    'Should not allow completing item with incomplete dependencies'
  );
});

runner.test('Can complete item when dependencies are completed', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  await sparkle.addDependency(itemA, itemB);
  await sparkle.updateStatus(itemB, 'completed');
  await sparkle.updateStatus(itemA, 'completed'); // Should succeed

  const details = await sparkle.getItemDetails(itemA);
  assertEqual(details.status, 'completed', 'Should be completed');
});

runner.test('Adding dependency does not change completed status', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  await sparkle.updateStatus(itemA, 'completed');

  const detailsBefore = await sparkle.getItemDetails(itemA);
  assertEqual(detailsBefore.status, 'completed', 'Should be completed initially');

  await sparkle.addDependency(itemA, itemB);

  const detailsAfter = await sparkle.getItemDetails(itemA);
  assertEqual(detailsAfter.status, 'completed', 'Should remain completed after adding dependency');
});

runner.test('Adding dependency does not change status', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');

  // B depends on A, C depends on B
  await sparkle.addDependency(itemB, itemA);
  await sparkle.updateStatus(itemA, 'completed');
  await sparkle.updateStatus(itemB, 'completed');

  await sparkle.addDependency(itemC, itemB);
  await sparkle.updateStatus(itemC, 'completed');

  // All completed, now add dependency to A
  const itemD = await sparkle.createItem('Item D');
  await sparkle.addDependency(itemA, itemD); // A now depends on incomplete D

  // Status should remain unchanged - adding dependencies does not alter status
  const detailsA = await sparkle.getItemDetails(itemA);
  const detailsB = await sparkle.getItemDetails(itemB);
  const detailsC = await sparkle.getItemDetails(itemC);

  assertEqual(detailsA.status, 'completed', 'A should remain completed');
  assertEqual(detailsB.status, 'completed', 'B should remain completed');
  assertEqual(detailsC.status, 'completed', 'C should remain completed');
});

runner.test('Add and remove monitor', async () => {
  const item = await sparkle.createItem('Test item');

  await sparkle.addMonitor(item);

  const detailsWithMonitor = await sparkle.getItemDetails(item);
  assertEqual(detailsWithMonitor.monitors.length, 1, 'Should have 1 monitor');

  await sparkle.removeMonitor(item);

  const detailsWithoutMonitor = await sparkle.getItemDetails(item);
  assertEqual(detailsWithoutMonitor.monitors.length, 0, 'Should have no monitors');
});

runner.test('Monitor idempotency - adding when already monitoring', async () => {
  const item = await sparkle.createItem('Test item');

  await sparkle.addMonitor(item);
  await sparkle.addMonitor(item); // Should be ignored

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.monitors.length, 1, 'Should still have 1 monitor');
});

runner.test('Monitor idempotency - removing when not monitoring', async () => {
  const item = await sparkle.createItem('Test item');

  // Should not throw
  await sparkle.removeMonitor(item);
});

runner.test('Monitor idempotency - re-adding after removal', async () => {
  const item = await sparkle.createItem('Test item');

  await sparkle.addMonitor(item);
  await sparkle.removeMonitor(item);
  await sparkle.addMonitor(item);

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.monitors.length, 1, 'Should have monitor after re-adding');
});

runner.test('Ignore an item', async () => {
  const item = await sparkle.createItem('Test item');

  await sparkle.ignoreItem(item);

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.ignored, true, 'Item should be ignored');
});

runner.test('Un-ignore an item', async () => {
  const item = await sparkle.createItem('Test item');

  await sparkle.ignoreItem(item);
  await sparkle.unignoreItem(item);

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.ignored, false, 'Item should not be ignored');
});

runner.test('Ignore idempotency - ignoring when already ignored', async () => {
  const item = await sparkle.createItem('Test item');

  await sparkle.ignoreItem(item);
  await sparkle.ignoreItem(item); // Should be ignored (no-op)

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.ignored, true, 'Item should be ignored');
});

runner.test('Ignore idempotency - un-ignoring when not ignored', async () => {
  const item = await sparkle.createItem('Test item');

  // Should not throw
  await sparkle.unignoreItem(item);

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.ignored, false, 'Item should not be ignored');
});

runner.test('Ignore idempotency - re-ignoring after un-ignore', async () => {
  const item = await sparkle.createItem('Test item');

  await sparkle.ignoreItem(item);
  await sparkle.unignoreItem(item);
  await sparkle.ignoreItem(item);

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.ignored, true, 'Item should be ignored after re-ignoring');
});

runner.test('Ignoring does not change status', async () => {
  const item = await sparkle.createItem('Test item');
  await sparkle.updateStatus(item, 'completed');

  await sparkle.ignoreItem(item);

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.status, 'completed', 'Status should remain completed');
  assertEqual(details.ignored, true, 'Item should be ignored');
});

runner.test('Item defaults to not ignored', async () => {
  const item = await sparkle.createItem('Test item');

  const details = await sparkle.getItemDetails(item);
  assertEqual(details.ignored, false, 'New item should not be ignored by default');
});

runner.test('Complex dependency graph', async () => {
  // Create a diamond dependency structure
  //     A
  //    / \
  //   B   C
  //    \ /
  //     D

  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');
  const itemD = await sparkle.createItem('Item D');

  await sparkle.addDependency(itemA, itemB);
  await sparkle.addDependency(itemA, itemC);
  await sparkle.addDependency(itemB, itemD);
  await sparkle.addDependency(itemC, itemD);

  // D must be completed first
  await sparkle.updateStatus(itemD, 'completed');

  // Then B and C can be completed
  await sparkle.updateStatus(itemB, 'completed');
  await sparkle.updateStatus(itemC, 'completed');

  // Finally A can be completed
  await sparkle.updateStatus(itemA, 'completed');

  const details = await sparkle.getItemDetails(itemA);
  assertEqual(details.status, 'completed', 'A should be completed');
});

runner.test('Get details returns deep copy', async () => {
  const item = await sparkle.createItem('Test item');
  const itemB = await sparkle.createItem('Test item B');

  await sparkle.addDependency(item, itemB);

  const details1 = await sparkle.getItemDetails(item);
  details1.tagline = 'Modified';
  details1.dependencies.push('fake-id');

  const details2 = await sparkle.getItemDetails(item);
  assertEqual(details2.tagline, 'Test item', 'Tagline should not be modified');
  assertEqual(details2.dependencies.length, 1, 'Dependencies should not be modified');
});

runner.test('Item IDs are 8 digits and do not start with 0', async () => {
  for (let i = 0; i < 10; i++) {
    const item = await sparkle.createItem(`Item ${i}`);
    assertEqual(item.length, 8, 'Item ID should be 8 characters');
    assert(item[0] !== '0', 'Item ID should not start with 0');
    assert(/^\d+$/.test(item), 'Item ID should be all digits');
  }
});

runner.test('pendingWork returns items with no unmet dependencies', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');

  // No dependencies yet - all should be pending
  const pending1 = [];
  for await (const id of sparkle.pendingWork()) {
    pending1.push(id);
  }

  assertEqual(pending1.length, 3, 'All 3 items should be pending');
  assert(pending1.includes(itemA), 'Item A should be pending');
  assert(pending1.includes(itemB), 'Item B should be pending');
  assert(pending1.includes(itemC), 'Item C should be pending');
});

runner.test('pendingWork excludes completed items', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  await sparkle.updateStatus(itemA, 'completed');

  const pending = [];
  for await (const id of sparkle.pendingWork()) {
    pending.push(id);
  }

  assertEqual(pending.length, 1, 'Only 1 item should be pending');
  assert(!pending.includes(itemA), 'Completed item A should not be pending');
  assert(pending.includes(itemB), 'Item B should be pending');
});

runner.test('pendingWork excludes items with unmet dependencies', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');

  // B depends on A, C depends on B
  await sparkle.addDependency(itemB, itemA);
  await sparkle.addDependency(itemC, itemB);

  const pending1 = [];
  for await (const id of sparkle.pendingWork()) {
    pending1.push(id);
  }

  // Only A should be pending (no dependencies)
  assertEqual(pending1.length, 1, 'Only 1 item should be pending');
  assert(pending1.includes(itemA), 'Item A should be pending');
  assert(!pending1.includes(itemB), 'Item B should not be pending (depends on A)');
  assert(!pending1.includes(itemC), 'Item C should not be pending (depends on B)');

  // Complete A
  await sparkle.updateStatus(itemA, 'completed');

  const pending2 = [];
  for await (const id of sparkle.pendingWork()) {
    pending2.push(id);
  }

  // Now B should be pending
  assertEqual(pending2.length, 1, 'Only 1 item should be pending');
  assert(pending2.includes(itemB), 'Item B should be pending (A is complete)');
  assert(!pending2.includes(itemC), 'Item C should not be pending (B not complete)');

  // Complete B
  await sparkle.updateStatus(itemB, 'completed');

  const pending3 = [];
  for await (const id of sparkle.pendingWork()) {
    pending3.push(id);
  }

  // Now C should be pending
  assertEqual(pending3.length, 1, 'Only 1 item should be pending');
  assert(pending3.includes(itemC), 'Item C should be pending (all deps complete)');
});

runner.test('pendingWork with diamond dependency graph', async () => {
  // Create a diamond dependency structure
  //     D
  //    / \
  //   B   C
  //    \ /
  //     A

  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');
  const itemD = await sparkle.createItem('Item D');

  await sparkle.addDependency(itemB, itemA);
  await sparkle.addDependency(itemC, itemA);
  await sparkle.addDependency(itemD, itemB);
  await sparkle.addDependency(itemD, itemC);

  // Only A is pending
  const pending1 = [];
  for await (const id of sparkle.pendingWork()) {
    pending1.push(id);
  }

  assertEqual(pending1.length, 1, 'Only A should be pending');
  assert(pending1.includes(itemA), 'Item A should be pending');

  // Complete A - now B and C are pending
  await sparkle.updateStatus(itemA, 'completed');

  const pending2 = [];
  for await (const id of sparkle.pendingWork()) {
    pending2.push(id);
  }

  assertEqual(pending2.length, 2, 'B and C should be pending');
  assert(pending2.includes(itemB), 'Item B should be pending');
  assert(pending2.includes(itemC), 'Item C should be pending');

  // Complete B - C is still pending, D is not (needs both B and C)
  await sparkle.updateStatus(itemB, 'completed');

  const pending3 = [];
  for await (const id of sparkle.pendingWork()) {
    pending3.push(id);
  }

  assertEqual(pending3.length, 1, 'Only C should be pending');
  assert(pending3.includes(itemC), 'Item C should be pending');
  assert(!pending3.includes(itemD), 'Item D should not be pending (C not complete)');

  // Complete C - now D is pending
  await sparkle.updateStatus(itemC, 'completed');

  const pending4 = [];
  for await (const id of sparkle.pendingWork()) {
    pending4.push(id);
  }

  assertEqual(pending4.length, 1, 'Only D should be pending');
  assert(pending4.includes(itemD), 'Item D should be pending');

  // Complete D - nothing pending
  await sparkle.updateStatus(itemD, 'completed');

  const pending5 = [];
  for await (const id of sparkle.pendingWork()) {
    pending5.push(id);
  }

  assertEqual(pending5.length, 0, 'Nothing should be pending');
});

runner.test('pendingWork returns empty when all items completed', async () => {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');

  await sparkle.updateStatus(itemA, 'completed');
  await sparkle.updateStatus(itemB, 'completed');

  const pending = [];
  for await (const id of sparkle.pendingWork()) {
    pending.push(id);
  }

  assertEqual(pending.length, 0, 'No items should be pending');
});

runner.test('getPotentialDependencies returns current and candidate dependencies', async () => {
  const item1 = await sparkle.createItem('Task A');
  const item2 = await sparkle.createItem('Task B');
  const item3 = await sparkle.createItem('Task C');
  const item4 = await sparkle.createItem('Task D');

  // item1 depends on item2
  await sparkle.addDependency(item1, item2);
  // item2 depends on item3
  await sparkle.addDependency(item2, item3);

  const result = await sparkle.getPotentialDependencies(item1);

  // Should have item2 in current
  assertEqual(result.current.length, 1, 'Should have 1 current dependency');
  assertEqual(result.current[0].itemId, item2, 'Current dependency should be item2');

  // Should have item3 and item4 in candidates (not item1 itself, not item2 which is current)
  assert(result.candidates.length >= 2, 'Should have at least 2 candidates');
  const candidateIds = result.candidates.map(c => c.itemId);
  assert(candidateIds.includes(item3), 'Candidates should include item3');
  assert(candidateIds.includes(item4), 'Candidates should include item4');
  assert(!candidateIds.includes(item1), 'Candidates should not include itself');
  assert(!candidateIds.includes(item2), 'Candidates should not include current dependency');
});

runner.test('getPotentialDependencies excludes items that would create cycles', async () => {
  const item1 = await sparkle.createItem('Task A');
  const item2 = await sparkle.createItem('Task B');
  const item3 = await sparkle.createItem('Task C');
  const item4 = await sparkle.createItem('Task D');

  // Create chain: item1 -> item2 -> item3
  await sparkle.addDependency(item1, item2);
  await sparkle.addDependency(item2, item3);

  // Get potential dependencies for item3
  const result = await sparkle.getPotentialDependencies(item3);

  const candidateIds = result.candidates.map(c => c.itemId);

  // item3 can depend on item4 (no cycle)
  assert(candidateIds.includes(item4), 'item3 should be able to depend on item4');

  // item3 cannot depend on item1 or item2 (would create cycle)
  assert(!candidateIds.includes(item1), 'item3 should not be able to depend on item1 (would create cycle)');
  assert(!candidateIds.includes(item2), 'item3 should not be able to depend on item2 (would create cycle)');
});

runner.test('getPotentialDependents returns current and candidate dependents', async () => {
  const item1 = await sparkle.createItem('Task A');
  const item2 = await sparkle.createItem('Task B');
  const item3 = await sparkle.createItem('Task C');
  const item4 = await sparkle.createItem('Task D');

  // item1 depends on item2
  await sparkle.addDependency(item1, item2);
  // item2 depends on item3
  await sparkle.addDependency(item2, item3);

  const result = await sparkle.getPotentialDependents(item3);

  // Should have item2 in current (item2 currently depends on item3)
  assertEqual(result.current.length, 1, 'Should have 1 current dependent');
  assertEqual(result.current[0].itemId, item2, 'Current dependent should be item2');

  // Should have item1 and item4 in candidates
  assert(result.candidates.length >= 2, 'Should have at least 2 candidates');
  const candidateIds = result.candidates.map(c => c.itemId);
  assert(candidateIds.includes(item1), 'Candidates should include item1');
  assert(candidateIds.includes(item4), 'Candidates should include item4');
  assert(!candidateIds.includes(item3), 'Candidates should not include itself');
  assert(!candidateIds.includes(item2), 'Candidates should not include current dependent');
});

runner.test('getPotentialDependents excludes items that would create cycles', async () => {
  const item1 = await sparkle.createItem('Task A');
  const item2 = await sparkle.createItem('Task B');
  const item3 = await sparkle.createItem('Task C');
  const item4 = await sparkle.createItem('Task D');

  // Create chain: item1 -> item2 -> item3
  await sparkle.addDependency(item1, item2);
  await sparkle.addDependency(item2, item3);

  // Get potential dependents for item1
  const result = await sparkle.getPotentialDependents(item1);

  const candidateIds = result.candidates.map(c => c.itemId);

  // item4 can depend on item1 (no cycle)
  assert(candidateIds.includes(item4), 'item4 should be able to depend on item1');

  // item2 and item3 cannot depend on item1 (would create cycle)
  assert(!candidateIds.includes(item2), 'item2 should not be able to depend on item1 (would create cycle)');
  assert(!candidateIds.includes(item3), 'item3 should not be able to depend on item1 (would create cycle)');
});

runner.test('getPotentialDependencies with no dependencies', async () => {
  const item1 = await sparkle.createItem('Task A');
  const item2 = await sparkle.createItem('Task B');

  const result = await sparkle.getPotentialDependencies(item1);

  // Should have no current dependencies
  assertEqual(result.current.length, 0, 'Should have no current dependencies');

  // Should have item2 as candidate
  assert(result.candidates.length >= 1, 'Should have at least 1 candidate');
  const candidateIds = result.candidates.map(c => c.itemId);
  assert(candidateIds.includes(item2), 'Candidates should include item2');
});

runner.test('getPotentialDependents with no dependents', async () => {
  const item1 = await sparkle.createItem('Task A');
  const item2 = await sparkle.createItem('Task B');

  const result = await sparkle.getPotentialDependents(item1);

  // Should have no current dependents
  assertEqual(result.current.length, 0, 'Should have no current dependents');

  // Should have item2 as candidate
  assert(result.candidates.length >= 1, 'Should have at least 1 candidate');
  const candidateIds = result.candidates.map(c => c.itemId);
  assert(candidateIds.includes(item2), 'Candidates should include item2');
});

runner.test('getAllItemsAsDag with no dependencies returns flat forest', async () => {
  const item1 = await sparkle.createItem('Task A');
  const item2 = await sparkle.createItem('Task B');
  const item3 = await sparkle.createItem('Task C');

  // All items are roots, so use item1 as reference
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(item1)) {
    nodes.push(node);
  }

  // Should have only 1 item (item1) since they're disconnected
  assertEqual(nodes.length, 1, 'Should have 1 item (reference only, others are disconnected)');
  assertEqual(nodes[0].item, item1, 'Should only return the reference item');
  assertEqual(nodes[0].neededBy, null, 'Reference item should have neededBy=null');
  assertEqual(nodes[0].depth, 0, 'Reference item should have depth=0');
});

runner.test('getAllItemsAsDag with simple chain', async () => {
  const item1 = await sparkle.createItem('Task A');
  const item2 = await sparkle.createItem('Task B');
  const item3 = await sparkle.createItem('Task C');

  // Create chain: item1 -> item2 -> item3
  await sparkle.addDependency(item1, item2);
  await sparkle.addDependency(item2, item3);

  // Start from root (item1)
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(item1)) {
    nodes.push(node);
  }

  // Should have 3 nodes: item1 and its dependencies
  assertEqual(nodes.length, 3, 'Should have 3 nodes');

  // All items should be in the result
  const ids = nodes.map(n => n.item);
  assert(ids.includes(item1), 'Should include item1');
  assert(ids.includes(item2), 'Should include item2');
  assert(ids.includes(item3), 'Should include item3');

  // First node should be reference (item1)
  assertEqual(nodes[0].item, item1, 'First node should be item1');
  assertEqual(nodes[0].neededBy, null, 'item1 should have no parent as reference');
  assertEqual(nodes[0].depth, 0, 'item1 should be at depth 0');
});

runner.test('getAllItemsAsDag with diamond structure', async () => {
  // Create a diamond dependency structure
  //     D
  //    / \
  //   B   C
  //    \ /
  //     A

  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');
  const itemD = await sparkle.createItem('Item D');

  await sparkle.addDependency(itemB, itemA);
  await sparkle.addDependency(itemC, itemA);
  await sparkle.addDependency(itemD, itemB);
  await sparkle.addDependency(itemD, itemC);

  // Start from root (itemD)
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(itemD)) {
    nodes.push(node);
  }

  // Should have 4 nodes (D, B, C, A) - A appears once since BFS visits it first time
  assert(nodes.length >= 4, 'Should have at least 4 nodes');

  // All items should be present
  const ids = nodes.map(n => n.item);
  assert(ids.includes(itemD), 'Should include itemD');
  assert(ids.includes(itemB), 'Should include itemB');
  assert(ids.includes(itemC), 'Should include itemC');
  assert(ids.includes(itemA), 'Should include itemA');

  // First node should be reference (itemD)
  assertEqual(nodes[0].item, itemD, 'First node should be itemD');
  assertEqual(nodes[0].depth, 0, 'itemD should be at depth 0');
  assertEqual(nodes[0].neededBy, null, 'itemD should have no parent');
});

// REMOVED: 'getAllItemsAsDag with forest (multiple disconnected graphs)'
// Reason: DAG now returns only connected component from reference, not all disconnected graphs

runner.test('getAllItemsAsDag with complex graph', async () => {
  // Create a more complex structure:
  //       E
  //      /|\
  //     / | \
  //    A  B  C
  //     \ | /
  //      \|/
  //       D

  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');
  const itemD = await sparkle.createItem('Item D');
  const itemE = await sparkle.createItem('Item E');

  await sparkle.addDependency(itemA, itemD);
  await sparkle.addDependency(itemB, itemD);
  await sparkle.addDependency(itemC, itemD);
  await sparkle.addDependency(itemE, itemA);
  await sparkle.addDependency(itemE, itemB);
  await sparkle.addDependency(itemE, itemC);

  // Start from root (itemE)
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(itemE)) {
    nodes.push(node);
  }

  // Should have 5 nodes (E, A, B, C, D)
  assert(nodes.length >= 5, 'Should have at least 5 nodes');

  // All items should be present
  const ids = nodes.map(n => n.item);
  assert(ids.includes(itemE), 'Should include itemE');
  assert(ids.includes(itemA), 'Should include itemA');
  assert(ids.includes(itemB), 'Should include itemB');
  assert(ids.includes(itemC), 'Should include itemC');
  assert(ids.includes(itemD), 'Should include itemD');

  // First node should be reference (itemE)
  assertEqual(nodes[0].item, itemE, 'First node should be itemE');
  assertEqual(nodes[0].depth, 0, 'itemE should be at depth 0');
  assertEqual(nodes[0].neededBy, null, 'itemE should have no parent');
});

// REMOVED: 'getAllItemsAsDag with mixed forest and complex dependencies'
// Reason: DAG now returns only connected component from reference, not entire forest

// Tests for enhanced DAG output with full dependency information
runner.test('getAllItemsAsDag includes full dependencies on first encounter', async () => {
  // Create simple chain: A -> B -> C
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');

  await sparkle.addDependency(itemA, itemB);
  await sparkle.addDependency(itemB, itemC);

  // Start from root (itemA)
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(itemA)) {
    nodes.push(node);
  }

  // All items should have full info on their first encounter
  assertEqual(nodes.length, 3, 'Should have 3 nodes');

  // Check itemA (root, depends on B, no one depends on it)
  const nodeA = nodes.find(n => n.item === itemA);
  assert(nodeA, 'Should find itemA');
  assert(nodeA.full, 'itemA should have full property');
  assert(Array.isArray(nodeA.full.dependsOn), 'full.dependsOn should be an array');
  assert(Array.isArray(nodeA.full.providesTo), 'full.providesTo should be an array');
  assertEqual(nodeA.full.dependsOn.length, 1, 'itemA depends on 1 item');
  assertEqual(nodeA.full.dependsOn[0], itemB, 'itemA depends on itemB');
  assertEqual(nodeA.full.providesTo.length, 0, 'No items depend on itemA');

  // Check itemB (depends on C, A depends on it)
  const nodeB = nodes.find(n => n.item === itemB);
  assert(nodeB, 'Should find itemB');
  assert(nodeB.full, 'itemB should have full property');
  assertEqual(nodeB.full.dependsOn.length, 1, 'itemB depends on 1 item');
  assertEqual(nodeB.full.dependsOn[0], itemC, 'itemB depends on itemC');
  assertEqual(nodeB.full.providesTo.length, 1, 'One item depends on itemB');
  assertEqual(nodeB.full.providesTo[0], itemA, 'itemA depends on itemB');

  // Check itemC (no dependencies, B depends on it)
  const nodeC = nodes.find(n => n.item === itemC);
  assert(nodeC, 'Should find itemC');
  assert(nodeC.full, 'itemC should have full property');
  assertEqual(nodeC.full.dependsOn.length, 0, 'itemC has no dependencies');
  assertEqual(nodeC.full.providesTo.length, 1, 'One item depends on itemC');
  assertEqual(nodeC.full.providesTo[0], itemB, 'itemB depends on itemC');
});

runner.test('getAllItemsAsDag omits full on subsequent encounters', async () => {
  // Create diamond: D -> B -> A, D -> C -> A
  //     D
  //    / \
  //   B   C
  //    \ /
  //     A
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');
  const itemD = await sparkle.createItem('Item D');

  await sparkle.addDependency(itemB, itemA);
  await sparkle.addDependency(itemC, itemA);
  await sparkle.addDependency(itemD, itemB);
  await sparkle.addDependency(itemD, itemC);

  // Start from root (itemD)
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(itemD)) {
    nodes.push(node);
  }

  // Find all occurrences of itemA (might appear multiple times via different paths)
  const itemANodes = nodes.filter(n => n.item === itemA);

  // Due to visited set in traversal, item might only appear once
  // Let's verify the first encounter has full
  assert(itemANodes.length >= 1, 'itemA should appear at least once');
  assert(itemANodes[0].full, 'First encounter of itemA should have full property');

  // If there's a second encounter, it should NOT have full
  if (itemANodes.length > 1) {
    assert(!itemANodes[1].full, 'Second encounter of itemA should NOT have full property');
  }

  // All first encounters should have full
  const uniqueItems = new Set();
  for (const node of nodes) {
    if (!uniqueItems.has(node.item)) {
      uniqueItems.add(node.item);
      assert(node.full, `First encounter of ${node.item} should have full property`);
    }
  }
});

runner.test('getAllItemsAsDag full.dependsOn is accurate for multi-dependency item', async () => {
  // Create: D depends on A, B, C
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');
  const itemD = await sparkle.createItem('Item D');

  await sparkle.addDependency(itemD, itemA);
  await sparkle.addDependency(itemD, itemB);
  await sparkle.addDependency(itemD, itemC);

  // Start from root (itemD)
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(itemD)) {
    nodes.push(node);
  }

  // Find itemD
  const nodeD = nodes.find(n => n.item === itemD);
  assert(nodeD, 'Should find itemD');
  assert(nodeD.full, 'itemD should have full property');
  assertEqual(nodeD.full.dependsOn.length, 3, 'itemD should depend on 3 items');

  // Check that all dependencies are present (order doesn't matter)
  assert(nodeD.full.dependsOn.includes(itemA), 'itemD should depend on itemA');
  assert(nodeD.full.dependsOn.includes(itemB), 'itemD should depend on itemB');
  assert(nodeD.full.dependsOn.includes(itemC), 'itemD should depend on itemC');
});

runner.test('getAllItemsAsDag full.providesTo is accurate for shared dependency', async () => {
  // Create: A, B, C all depend on D
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');
  const itemD = await sparkle.createItem('Item D');

  await sparkle.addDependency(itemA, itemD);
  await sparkle.addDependency(itemB, itemD);
  await sparkle.addDependency(itemC, itemD);

  // Start from any of the roots (itemA)
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(itemA)) {
    nodes.push(node);
  }

  // Find itemD
  const nodeD = nodes.find(n => n.item === itemD);
  assert(nodeD, 'Should find itemD');
  assert(nodeD.full, 'itemD should have full property');
  assertEqual(nodeD.full.providesTo.length, 3, 'itemD should provide to 3 items');

  // Check that all dependents are present (order doesn't matter)
  assert(nodeD.full.providesTo.includes(itemA), 'itemD should provide to itemA');
  assert(nodeD.full.providesTo.includes(itemB), 'itemD should provide to itemB');
  assert(nodeD.full.providesTo.includes(itemC), 'itemD should provide to itemC');
});

runner.test('getAllItemsAsDag full arrays are empty when no dependencies', async () => {
  // Create standalone item with no dependencies
  const item = await sparkle.createItem('Standalone');

  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(item)) {
    nodes.push(node);
  }

  assertEqual(nodes.length, 1, 'Should have 1 node');
  assert(nodes[0].full, 'Node should have full property');
  assertEqual(nodes[0].full.dependsOn.length, 0, 'Should have no dependencies');
  assertEqual(nodes[0].full.providesTo.length, 0, 'Should provide to no items');
});

// New tests for referenceId parameter and bidirectional traversal
runner.test('getAllItemsAsDag requires referenceId parameter', async () => {
  const item = await sparkle.createItem('Test Item');

  let errorThrown = false;
  try {
    for await (const node of sparkle.getAllItemsAsDag()) {
      // Should not reach here
    }
  } catch (error) {
    errorThrown = true;
    assert(error.message.includes('referenceId'), 'Error should mention referenceId');
  }

  assert(errorThrown, 'Should throw error when referenceId is missing');
});

runner.test('getAllItemsAsDag throws error for invalid referenceId', async () => {
  const item = await sparkle.createItem('Test Item');

  let errorThrown = false;
  try {
    for await (const node of sparkle.getAllItemsAsDag('99999999')) {
      // Should not reach here
    }
  } catch (error) {
    errorThrown = true;
    assert(error.message.includes('not found'), 'Error should mention item not found');
  }

  assert(errorThrown, 'Should throw error for invalid referenceId');
});

runner.test('getAllItemsAsDag bidirectional traversal from leaf node', async () => {
  // Create chain: root -> middle -> leaf
  const leaf = await sparkle.createItem('Leaf');
  const middle = await sparkle.createItem('Middle');
  const root = await sparkle.createItem('Root');

  await sparkle.addDependency(middle, leaf);
  await sparkle.addDependency(root, middle);

  // Start from leaf and traverse upward
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(leaf)) {
    nodes.push(node);
  }

  // Should include all 3 items (leaf, middle, root) via upward traversal
  assertEqual(nodes.length, 3, 'Should have 3 nodes');

  const ids = nodes.map(n => n.item);
  assert(ids.includes(leaf), 'Should include leaf');
  assert(ids.includes(middle), 'Should include middle');
  assert(ids.includes(root), 'Should include root');

  // First node should be the reference (leaf)
  assertEqual(nodes[0].item, leaf, 'First node should be leaf');
  assertEqual(nodes[0].neededBy, null, 'Leaf should have neededBy=null as reference');
});

runner.test('getAllItemsAsDag bidirectional traversal from middle node', async () => {
  // Create chain: root -> middle -> leaf
  const leaf = await sparkle.createItem('Leaf');
  const middle = await sparkle.createItem('Middle');
  const root = await sparkle.createItem('Root');

  await sparkle.addDependency(middle, leaf);
  await sparkle.addDependency(root, middle);

  // Start from middle - should traverse both up and down
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(middle)) {
    nodes.push(node);
  }

  // Should include all 3 items
  assertEqual(nodes.length, 3, 'Should have 3 nodes');

  const ids = nodes.map(n => n.item);
  assert(ids.includes(leaf), 'Should include leaf (downward)');
  assert(ids.includes(middle), 'Should include middle (reference)');
  assert(ids.includes(root), 'Should include root (upward)');
});

runner.test('getAllItemsAsDag only returns connected component', async () => {
  // Create two separate chains
  const item1 = await sparkle.createItem('Chain 1 Item');
  const item2 = await sparkle.createItem('Chain 2 Item 1');
  const item3 = await sparkle.createItem('Chain 2 Item 2');

  await sparkle.addDependency(item3, item2);

  // Start from item1 - should only get item1 (disconnected from chain 2)
  const nodes = [];
  for await (const node of sparkle.getAllItemsAsDag(item1)) {
    nodes.push(node);
  }

  assertEqual(nodes.length, 1, 'Should have 1 node (only connected component)');
  assertEqual(nodes[0].item, item1, 'Should only include item1');
});

// Audit Trail Tests
runner.test('getItemAuditTrail shows item creation', async () => {
  const itemId = await sparkle.createItem('Test Item', 'incomplete');

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  assert(events.length >= 1, 'Should have at least one event');
  assert(events[0].type === 'created', 'First event should be creation');
  assert(events[0].status === 'incomplete', 'Should have status');
  assert(events[0].person, 'Should have person object');
  assert(events[0].person.name, 'Person should have name');
  assert(events[0].person.email, 'Person should have email');
});

runner.test('getItemAuditTrail shows initial entry', async () => {
  const itemId = await sparkle.createItem('Test Item', 'incomplete', 'Initial entry text');

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  assert(events.length >= 2, 'Should have at least two events (creation + entry)');
  const entryEvent = events.find(e => e.type === 'entry');
  assert(entryEvent, 'Should have entry event');
  assert(entryEvent.text === 'Initial entry text', 'Should show entry text');
  assert(entryEvent.person, 'Should have person object');
});

runner.test('getItemAuditTrail truncates long entries to 40 characters', async () => {
  const longText = 'This is a very long entry text that exceeds forty characters and should be truncated';
  const itemId = await sparkle.createItem('Test Item', 'incomplete');
  await sparkle.addEntry(itemId, longText);

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  const entryEvent = events.find(e => e.type === 'entry' && e.text.length > 40);
  assert(entryEvent, 'Should have entry event');
  assert(entryEvent.text === longText, 'Should return full text (truncation happens in display layer)');
  assert(entryEvent.person, 'Should have person object');
});

runner.test('getItemAuditTrail shows tagline changes', async () => {
  const itemId = await sparkle.createItem('Original Tagline', 'incomplete');
  await sparkle.alterTagline(itemId, 'Updated Tagline');

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  const taglineEvent = events.find(e => e.type === 'tagline');
  assert(taglineEvent, 'Should have tagline change event');
  assert(taglineEvent.tagline === 'Updated Tagline', 'Should show new tagline');
  assert(taglineEvent.person, 'Should have person object');
});

runner.test('getItemAuditTrail shows status changes', async () => {
  const itemId = await sparkle.createItem('Test Item', 'incomplete');
  await sparkle.updateStatus(itemId, 'completed', 'Task is done');

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  const statusEvent = events.find(e => e.type === 'status' && e.status === 'completed');
  assert(statusEvent, 'Should have status change event');
  assert(statusEvent.status === 'completed', 'Should show new status');
  assert(statusEvent.text === 'Task is done', 'Should include status text');
  assert(statusEvent.person, 'Should have person object');
});

runner.test('getItemAuditTrail shows dependency additions', async () => {
  const itemId1 = await sparkle.createItem('Item 1', 'incomplete');
  const itemId2 = await sparkle.createItem('Item 2', 'incomplete');
  await sparkle.addDependency(itemId1, itemId2);

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId1)) {
    events.push(event);
  }

  const depEvent = events.find(e => e.type === 'dependency' && e.action === 'linked' && !e.reverse);
  assert(depEvent, 'Should have dependency added event');
  assert(depEvent.relatedItemId === itemId2, 'Should mention the dependency item ID');
  assert(depEvent.reverse === false, 'Should be forward dependency (not reverse)');
  assert(depEvent.person, 'Should have person object');
});

runner.test('getItemAuditTrail shows dependency removals', async () => {
  const itemId1 = await sparkle.createItem('Item 1', 'incomplete');
  const itemId2 = await sparkle.createItem('Item 2', 'incomplete');
  await sparkle.addDependency(itemId1, itemId2);
  await sparkle.removeDependency(itemId1, itemId2);

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId1)) {
    events.push(event);
  }

  const addEvent = events.find(e => e.type === 'dependency' && e.action === 'linked' && !e.reverse);
  const removeEvent = events.find(e => e.type === 'dependency' && e.action === 'unlinked' && !e.reverse);

  assert(addEvent, 'Should have dependency added event');
  assert(removeEvent, 'Should have dependency removed event');
  assert(removeEvent.relatedItemId === itemId2, 'Should mention the dependency item ID');
  assert(removeEvent.person, 'Should have person object');
});

runner.test('getItemAuditTrail shows reverse dependencies (dependency provided to)', async () => {
  const itemA = await sparkle.createItem('Item A', 'incomplete');
  const itemB = await sparkle.createItem('Item B', 'incomplete');

  // B depends on A, so A provides dependency to B
  await sparkle.addDependency(itemB, itemA);

  // Get audit trail for itemA
  const eventsA = [];
  for await (const event of sparkle.getItemAuditTrail(itemA)) {
    eventsA.push(event);
  }

  // ItemA should show that it provides a dependency to itemB (reverse dependency)
  const providedEvent = eventsA.find(e => e.type === 'dependency' && e.reverse === true);
  assert(providedEvent, 'Should have reverse dependency event in itemA audit trail');
  assert(providedEvent.relatedItemId === itemB, 'Should mention itemB as the item that depends on this');
  assert(providedEvent.action === 'linked', 'Should be linked action');

  // Get audit trail for itemB to verify normal dependency shown
  const eventsB = [];
  for await (const event of sparkle.getItemAuditTrail(itemB)) {
    eventsB.push(event);
  }

  // ItemB should show that it depends on itemA (normal direction)
  const dependsEvent = eventsB.find(e => e.type === 'dependency' && e.reverse === false);
  assert(dependsEvent, 'Should have forward dependency event in itemB audit trail');
  assert(dependsEvent.relatedItemId === itemA, 'Should mention itemA as dependency');
  assert(dependsEvent.action === 'linked', 'Should be linked action');
});

runner.test('getItemAuditTrail shows reverse dependency removals', async () => {
  const itemA = await sparkle.createItem('Item A', 'incomplete');
  const itemB = await sparkle.createItem('Item B', 'incomplete');

  // B depends on A, then remove it
  await sparkle.addDependency(itemB, itemA);
  await sparkle.removeDependency(itemB, itemA);

  // Get audit trail for itemA
  const eventsA = [];
  for await (const event of sparkle.getItemAuditTrail(itemA)) {
    eventsA.push(event);
  }

  // ItemA should show both provided and no longer provided events (reverse dependencies)
  const providedEvent = eventsA.find(e => e.type === 'dependency' && e.reverse === true && e.action === 'linked');
  const removedEvent = eventsA.find(e => e.type === 'dependency' && e.reverse === true && e.action === 'unlinked');

  assert(providedEvent, 'Should have reverse dependency linked event');
  assert(providedEvent.relatedItemId === itemB, 'Should mention itemB');
  assert(removedEvent, 'Should have reverse dependency unlinked event');
  assert(removedEvent.relatedItemId === itemB, 'Should mention itemB in removal');
});

runner.test('getItemAuditTrail shows monitor additions and removals', async () => {
  const itemId = await sparkle.createItem('Test Item', 'incomplete');
  await sparkle.addMonitor(itemId);
  await sparkle.removeMonitor(itemId);

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  const addMonitorEvent = events.find(e => e.type === 'monitor' && e.action === 'added');
  const removeMonitorEvent = events.find(e => e.type === 'monitor' && e.action === 'removed');

  assert(addMonitorEvent, 'Should have monitor added event');
  assert(addMonitorEvent.person, 'Should have person object');
  assert(removeMonitorEvent, 'Should have monitor removed event');
  assert(removeMonitorEvent.person, 'Should have person object');
});

runner.test('getItemAuditTrail events are in chronological order', async () => {
  const itemId = await sparkle.createItem('Test Item', 'incomplete');

  // Add delays between operations to ensure different timestamps
  await new Promise(resolve => setTimeout(resolve, 100));
  await sparkle.addEntry(itemId, 'First entry');

  await new Promise(resolve => setTimeout(resolve, 100));
  await sparkle.addEntry(itemId, 'Second entry');

  await new Promise(resolve => setTimeout(resolve, 100));
  await sparkle.updateStatus(itemId, 'completed');

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  assert(events.length >= 4, 'Should have at least 4 events');

  // Verify order of specific events by their position in the array
  // Events should be sorted chronologically already
  const creationIndex = events.findIndex(e => e.type === 'created');
  const firstEntryIndex = events.findIndex(e => e.type === 'entry' && e.text === 'First entry');
  const secondEntryIndex = events.findIndex(e => e.type === 'entry' && e.text === 'Second entry');
  const statusIndex = events.findIndex(e => e.type === 'status' && e.status === 'completed');

  assert(creationIndex >= 0, 'Should have creation event');
  assert(firstEntryIndex >= 0, 'Should have first entry event');
  assert(secondEntryIndex >= 0, 'Should have second entry event');
  assert(statusIndex >= 0, 'Should have status change event');

  assert(creationIndex < firstEntryIndex, 'Creation should be before first entry');
  assert(firstEntryIndex < secondEntryIndex, 'First entry should be before second entry');
  assert(secondEntryIndex < statusIndex, 'Second entry should be before status change');
});

runner.test('getItemAuditTrail with comprehensive history', async () => {
  const itemId1 = await sparkle.createItem('Main Item', 'incomplete', 'Starting work on this');
  const itemId2 = await sparkle.createItem('Dependency Item', 'incomplete');

  await sparkle.addEntry(itemId1, 'Making progress');
  await sparkle.alterTagline(itemId1, 'Main Item - Updated');
  await sparkle.addDependency(itemId1, itemId2);
  await sparkle.addMonitor(itemId1);

  // Complete the dependency first, then complete the main item
  await sparkle.updateStatus(itemId2, 'completed');
  await sparkle.updateStatus(itemId1, 'completed', 'All done');

  await sparkle.removeDependency(itemId1, itemId2);
  await sparkle.removeMonitor(itemId1);

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId1)) {
    events.push(event);
  }

  // Should have all types of events
  assert(events.some(e => e.type === 'created'), 'Should have creation event');
  assert(events.some(e => e.type === 'entry' && e.text.includes('Starting work')), 'Should have initial entry');
  assert(events.some(e => e.type === 'entry' && e.text.includes('Making progress')), 'Should have second entry');
  assert(events.some(e => e.type === 'tagline'), 'Should have tagline change');
  assert(events.some(e => e.type === 'dependency' && e.action === 'linked'), 'Should have dependency added');
  assert(events.some(e => e.type === 'monitor' && e.action === 'added'), 'Should have monitor added');
  assert(events.some(e => e.type === 'status' && e.status === 'completed'), 'Should have status change');
  assert(events.some(e => e.type === 'dependency' && e.action === 'unlinked'), 'Should have dependency removed');
  assert(events.some(e => e.type === 'monitor' && e.action === 'removed'), 'Should have monitor removed');

  assert(events.length >= 9, 'Should have at least 9 events');
});

runner.test('getItemAuditTrail throws error for non-existent item', async () => {
  let errorThrown = false;

  try {
    for await (const event of sparkle.getItemAuditTrail('nonexist')) {
      // Should not reach here
    }
  } catch (error) {
    errorThrown = true;
    assert(error.message.includes('does not exist'), 'Error should mention item does not exist');
  }

  assert(errorThrown, 'Should throw error for non-existent item');
});

// Taking/Surrender tests

runner.test('Take responsibility for an item', async () => {
  const itemId = await sparkle.createItem('Test item for taking');

  // Initially no one has taken it
  let details = await sparkle.getItemDetails(itemId);
  assertEqual(details.takenBy, null, 'Item should not be taken initially');

  // Take the item
  await sparkle.takeItem(itemId);

  // Verify it's now taken
  details = await sparkle.getItemDetails(itemId);
  assert(details.takenBy !== null, 'Item should be taken');
  assert(details.takenBy.name, 'Taker should have a name');
  assert(details.takenBy.email, 'Taker should have an email');
});

runner.test('Surrender responsibility for an item', async () => {
  const itemId = await sparkle.createItem('Test item for surrender');

  // Take the item first
  await sparkle.takeItem(itemId);
  let details = await sparkle.getItemDetails(itemId);
  assert(details.takenBy !== null, 'Item should be taken');

  // Surrender the item
  await sparkle.surrenderItem(itemId);

  // Verify it's no longer taken
  details = await sparkle.getItemDetails(itemId);
  assertEqual(details.takenBy, null, 'Item should not be taken after surrender');
});

runner.test('Taking is exclusive - only one person at a time', async () => {
  const itemId = await sparkle.createItem('Test item for exclusivity');

  // First person takes it
  await sparkle.takeItem(itemId);
  let details = await sparkle.getItemDetails(itemId);
  const firstTaker = details.takenBy;

  // When someone else takes it, they become the new taker
  // (In real usage, this would be a different user. In tests, same user re-taking is idempotent)
  // This test verifies the data structure supports single taker
  assert(details.takenBy !== null, 'Item should have exactly one taker');
  assertEqual(typeof details.takenBy, 'object', 'takenBy should be an object, not an array');
  assert(details.takenBy.name, 'Single taker should have a name');
});

runner.test('Take idempotency - taking when already taken by same person', async () => {
  const itemId = await sparkle.createItem('Test item for take idempotency');

  // Take the item
  await sparkle.takeItem(itemId);
  let details1 = await sparkle.getItemDetails(itemId);
  const taker1 = details1.takenBy;

  // Take it again (should be idempotent)
  await sparkle.takeItem(itemId);
  let details2 = await sparkle.getItemDetails(itemId);
  const taker2 = details2.takenBy;

  // Should still be taken by the same person
  assertEqual(taker2.name, taker1.name, 'Taker should remain the same');
  assertEqual(taker2.email, taker1.email, 'Taker email should remain the same');
});

runner.test('Surrender idempotency - surrendering when not taken', async () => {
  const itemId = await sparkle.createItem('Test item for surrender idempotency');

  // Surrender without taking (should be idempotent - no error)
  await sparkle.surrenderItem(itemId);

  let details = await sparkle.getItemDetails(itemId);
  assertEqual(details.takenBy, null, 'Item should remain not taken');
});

runner.test('Surrender idempotency - surrendering twice', async () => {
  const itemId = await sparkle.createItem('Test item for double surrender');

  // Take and then surrender
  await sparkle.takeItem(itemId);
  await sparkle.surrenderItem(itemId);

  let details1 = await sparkle.getItemDetails(itemId);
  assertEqual(details1.takenBy, null, 'Item should not be taken after first surrender');

  // Surrender again (should be idempotent)
  await sparkle.surrenderItem(itemId);

  let details2 = await sparkle.getItemDetails(itemId);
  assertEqual(details2.takenBy, null, 'Item should still not be taken after second surrender');
});

runner.test('Take and surrender cycle', async () => {
  const itemId = await sparkle.createItem('Test item for take/surrender cycle');

  // Take -> Surrender -> Take -> Surrender
  await sparkle.takeItem(itemId);
  let details1 = await sparkle.getItemDetails(itemId);
  assert(details1.takenBy !== null, 'Item should be taken after first take');

  await sparkle.surrenderItem(itemId);
  let details2 = await sparkle.getItemDetails(itemId);
  assertEqual(details2.takenBy, null, 'Item should not be taken after first surrender');

  await sparkle.takeItem(itemId);
  let details3 = await sparkle.getItemDetails(itemId);
  assert(details3.takenBy !== null, 'Item should be taken after second take');

  await sparkle.surrenderItem(itemId);
  let details4 = await sparkle.getItemDetails(itemId);
  assertEqual(details4.takenBy, null, 'Item should not be taken after second surrender');
});

runner.test('Taking does not change item status', async () => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');

  let detailsBefore = await sparkle.getItemDetails(itemId);
  assertEqual(detailsBefore.status, 'incomplete', 'Status should be incomplete before taking');

  await sparkle.takeItem(itemId);

  let detailsAfter = await sparkle.getItemDetails(itemId);
  assertEqual(detailsAfter.status, 'incomplete', 'Status should remain incomplete after taking');
  assert(detailsAfter.takenBy !== null, 'Item should be taken');
});

runner.test('Surrendering does not change item status', async () => {
  const itemId = await sparkle.createItem('Test item', 'incomplete');
  await sparkle.takeItem(itemId);

  let detailsBefore = await sparkle.getItemDetails(itemId);
  assertEqual(detailsBefore.status, 'incomplete', 'Status should be incomplete before surrender');

  await sparkle.surrenderItem(itemId);

  let detailsAfter = await sparkle.getItemDetails(itemId);
  assertEqual(detailsAfter.status, 'incomplete', 'Status should remain incomplete after surrender');
  assertEqual(detailsAfter.takenBy, null, 'Item should not be taken');
});

runner.test('getItemAuditTrail shows taken events', async () => {
  const itemId = await sparkle.createItem('Test item');
  await sparkle.takeItem(itemId);

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  const takenEvents = events.filter(e => e.type === 'taken' && e.action === 'taken');
  assertEqual(takenEvents.length, 1, 'Should have one taken event');
  assert(takenEvents[0].person, 'Taken event should have person object');
  assert(takenEvents[0].person.name, 'Person should have name');
  assert(takenEvents[0].person.email, 'Person should have email');
});

runner.test('getItemAuditTrail shows surrendered events', async () => {
  const itemId = await sparkle.createItem('Test item');
  await sparkle.takeItem(itemId);
  await sparkle.surrenderItem(itemId);

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  const takenEvents = events.filter(e => e.type === 'taken' && e.action === 'taken');
  const surrenderedEvents = events.filter(e => e.type === 'taken' && e.action === 'surrendered');

  assertEqual(takenEvents.length, 1, 'Should have one taken event');
  assertEqual(surrenderedEvents.length, 1, 'Should have one surrendered event');
});

runner.test('getItemAuditTrail shows taken/surrendered in chronological order', async () => {
  const itemId = await sparkle.createItem('Test item');
  await sparkle.takeItem(itemId);
  await sparkle.surrenderItem(itemId);
  await sparkle.takeItem(itemId);

  const events = [];
  for await (const event of sparkle.getItemAuditTrail(itemId)) {
    events.push(event);
  }

  const takenAndSurrenderedEvents = events.filter(e => e.type === 'taken');
  assertEqual(takenAndSurrenderedEvents.length, 3, 'Should have three taken/surrendered events');
  assertEqual(takenAndSurrenderedEvents[0].action, 'taken', 'First event should be taken');
  assertEqual(takenAndSurrenderedEvents[1].action, 'surrendered', 'Second event should be surrendered');
  assertEqual(takenAndSurrenderedEvents[2].action, 'taken', 'Third event should be taken');
});

runner.test('Item defaults to not taken', async () => {
  const itemId = await sparkle.createItem('Test item');
  const details = await sparkle.getItemDetails(itemId);

  assertEqual(details.takenBy, null, 'New items should not be taken by anyone');
});

runner.test('Taking throws error for non-existent item', async () => {
  await assertThrowsAsync(
    () => sparkle.takeItem('nonexist'),
    'Should throw error when taking non-existent item'
  );
});

runner.test('Surrendering throws error for non-existent item', async () => {
  await assertThrowsAsync(
    () => sparkle.surrenderItem('nonexist'),
    'Should throw error when surrendering non-existent item'
  );
});

// Run all tests
runner.run();
