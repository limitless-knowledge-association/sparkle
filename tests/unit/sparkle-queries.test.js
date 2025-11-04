/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle query operations tests
 * Tests: pendingWork, getPotentialDependencies, getPotentialDependents
 */

import { setupSparkle, createDiamond } from './sparkle-test-helpers.js';

describe('Sparkle - Queries', () => {
  let sparkle;

  beforeEach(async () => {
    sparkle = await setupSparkle('query-tests');
  });

  describe('pendingWork', () => {
    test('returns items with no unmet dependencies', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');
      const itemC = await sparkle.createItem('Item C');

      // No dependencies yet - all should be pending
      const pending1 = [];
      for await (const id of sparkle.pendingWork()) {
        pending1.push(id);
      }

      expect(pending1.length).toBe(3);
      expect(pending1).toContain(itemA);
      expect(pending1).toContain(itemB);
      expect(pending1).toContain(itemC);
    });

    test('excludes completed items', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      await sparkle.updateStatus(itemA, 'completed');

      const pending = [];
      for await (const id of sparkle.pendingWork()) {
        pending.push(id);
      }

      expect(pending.length).toBe(1);
      expect(pending).not.toContain(itemA);
      expect(pending).toContain(itemB);
    });

    test('excludes items with unmet dependencies', async () => {
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
      expect(pending1.length).toBe(1);
      expect(pending1).toContain(itemA);
      expect(pending1).not.toContain(itemB);
      expect(pending1).not.toContain(itemC);

      // Complete A
      await sparkle.updateStatus(itemA, 'completed');

      const pending2 = [];
      for await (const id of sparkle.pendingWork()) {
        pending2.push(id);
      }

      // Now B should be pending
      expect(pending2.length).toBe(1);
      expect(pending2).toContain(itemB);
      expect(pending2).not.toContain(itemC);

      // Complete B
      await sparkle.updateStatus(itemB, 'completed');

      const pending3 = [];
      for await (const id of sparkle.pendingWork()) {
        pending3.push(id);
      }

      // Now C should be pending
      expect(pending3.length).toBe(1);
      expect(pending3).toContain(itemC);
    });

    test('with diamond dependency graph', async () => {
      const { itemA, itemB, itemC, itemD } = await createDiamond(sparkle);

      // Only A is pending
      const pending1 = [];
      for await (const id of sparkle.pendingWork()) {
        pending1.push(id);
      }

      expect(pending1.length).toBe(1);
      expect(pending1).toContain(itemA);

      // Complete A - now B and C should be pending
      await sparkle.updateStatus(itemA, 'completed');

      const pending2 = [];
      for await (const id of sparkle.pendingWork()) {
        pending2.push(id);
      }

      expect(pending2.length).toBe(2);
      expect(pending2).toContain(itemB);
      expect(pending2).toContain(itemC);

      // Complete B - C still pending, D not yet
      await sparkle.updateStatus(itemB, 'completed');

      const pending3 = [];
      for await (const id of sparkle.pendingWork()) {
        pending3.push(id);
      }

      expect(pending3.length).toBe(1);
      expect(pending3).toContain(itemC);

      // Complete C - now D should be pending
      await sparkle.updateStatus(itemC, 'completed');

      const pending4 = [];
      for await (const id of sparkle.pendingWork()) {
        pending4.push(id);
      }

      expect(pending4.length).toBe(1);
      expect(pending4).toContain(itemD);

      // Complete D - nothing pending
      await sparkle.updateStatus(itemD, 'completed');

      const pending5 = [];
      for await (const id of sparkle.pendingWork()) {
        pending5.push(id);
      }

      expect(pending5.length).toBe(0);
    });

    test('returns empty when all items completed', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      await sparkle.updateStatus(itemA, 'completed');
      await sparkle.updateStatus(itemB, 'completed');

      const pending = [];
      for await (const id of sparkle.pendingWork()) {
        pending.push(id);
      }

      expect(pending.length).toBe(0);
    });
  });

  describe('getPotentialDependencies', () => {
    test('returns current and candidate dependencies', async () => {
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
      expect(result.current.length).toBe(1);
      expect(result.current[0].itemId).toBe(item2);

      // Should have item3 and item4 in candidates (not item1 itself, not item2 which is current)
      expect(result.candidates.length).toBeGreaterThanOrEqual(2);
      const candidateIds = result.candidates.map(c => c.itemId);
      expect(candidateIds).toContain(item3);
      expect(candidateIds).toContain(item4);
      expect(candidateIds).not.toContain(item1);
      expect(candidateIds).not.toContain(item2);
    });

    test('excludes items that would create cycles', async () => {
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
      expect(candidateIds).toContain(item4);

      // item3 cannot depend on item1 or item2 (would create cycle)
      expect(candidateIds).not.toContain(item1);
      expect(candidateIds).not.toContain(item2);
    });

    test('with no dependencies', async () => {
      const item1 = await sparkle.createItem('Task A');
      const item2 = await sparkle.createItem('Task B');

      const result = await sparkle.getPotentialDependencies(item1);

      // No current dependencies
      expect(result.current.length).toBe(0);

      // Should have item2 as candidate
      const candidateIds = result.candidates.map(c => c.itemId);
      expect(candidateIds).toContain(item2);
      expect(candidateIds).not.toContain(item1);
    });
  });

  describe('getPotentialDependents', () => {
    test('returns current and candidate dependents', async () => {
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
      expect(result.current.length).toBe(1);
      expect(result.current[0].itemId).toBe(item2);

      // Should have item1 and item4 in candidates
      expect(result.candidates.length).toBeGreaterThanOrEqual(2);
      const candidateIds = result.candidates.map(c => c.itemId);
      expect(candidateIds).toContain(item1);
      expect(candidateIds).toContain(item4);
      expect(candidateIds).not.toContain(item3);
      expect(candidateIds).not.toContain(item2);
    });

    test('excludes items that would create cycles', async () => {
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
      expect(candidateIds).toContain(item4);

      // item2 and item3 cannot depend on item1 (would create cycle)
      expect(candidateIds).not.toContain(item2);
      expect(candidateIds).not.toContain(item3);
    });

    test('with no dependents', async () => {
      const item1 = await sparkle.createItem('Task A');
      const item2 = await sparkle.createItem('Task B');

      const result = await sparkle.getPotentialDependents(item1);

      // No current dependents
      expect(result.current.length).toBe(0);

      // Should have item2 as candidate
      const candidateIds = result.candidates.map(c => c.itemId);
      expect(candidateIds).toContain(item2);
      expect(candidateIds).not.toContain(item1);
    });
  });
});
