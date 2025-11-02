/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle dependency management tests
 * Tests: Adding/removing dependencies, idempotency, circular detection, completion rules
 */

import { setupSparkle } from './sparkle-test-helpers.js';

describe('Sparkle - Dependencies', () => {
  let sparkle;

  beforeEach(async () => {
    sparkle = await setupSparkle('dependency-tests');
  });

  describe('Add and remove', () => {
    test('add and remove dependency', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      await sparkle.addDependency(itemA, itemB);

      const detailsA = await sparkle.getItemDetails(itemA);
      expect(detailsA.dependencies.length).toBe(1);
      expect(detailsA.dependencies[0]).toBe(itemB);

      await sparkle.removeDependency(itemA, itemB);

      const detailsA2 = await sparkle.getItemDetails(itemA);
      expect(detailsA2.dependencies.length).toBe(0);
    });
  });

  describe('Idempotency', () => {
    test('adding existing dependency', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      await sparkle.addDependency(itemA, itemB);
      await sparkle.addDependency(itemA, itemB); // Should be ignored

      const details = await sparkle.getItemDetails(itemA);
      expect(details.dependencies.length).toBe(1);
    });

    test('removing non-existent dependency', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      // Should not throw
      await expect(
        sparkle.removeDependency(itemA, itemB)
      ).resolves.not.toThrow();
    });

    test('re-adding after removal', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      await sparkle.addDependency(itemA, itemB);
      await sparkle.removeDependency(itemA, itemB);
      await sparkle.addDependency(itemA, itemB);

      const details = await sparkle.getItemDetails(itemA);
      expect(details.dependencies.length).toBe(1);
    });
  });

  describe('Circular dependency detection', () => {
    test('detect circular dependency', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');
      const itemC = await sparkle.createItem('Item C');

      await sparkle.addDependency(itemA, itemB);
      await sparkle.addDependency(itemB, itemC);

      await expect(
        sparkle.addDependency(itemC, itemA)
      ).rejects.toThrow();
    });

    test('detect direct circular dependency', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      await sparkle.addDependency(itemA, itemB);

      await expect(
        sparkle.addDependency(itemB, itemA)
      ).rejects.toThrow();
    });
  });

  describe('Completion rules', () => {
    test('cannot complete item with incomplete dependencies', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      await sparkle.addDependency(itemA, itemB);

      await expect(
        sparkle.updateStatus(itemA, 'completed')
      ).rejects.toThrow();
    });

    test('can complete item when dependencies are completed', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      await sparkle.addDependency(itemA, itemB);
      await sparkle.updateStatus(itemB, 'completed');
      await sparkle.updateStatus(itemA, 'completed'); // Should succeed

      const details = await sparkle.getItemDetails(itemA);
      expect(details.status).toBe('completed');
    });
  });

  describe('Status preservation', () => {
    test('adding dependency does not change completed status', async () => {
      const itemA = await sparkle.createItem('Item A');
      const itemB = await sparkle.createItem('Item B');

      await sparkle.updateStatus(itemA, 'completed');

      const detailsBefore = await sparkle.getItemDetails(itemA);
      expect(detailsBefore.status).toBe('completed');

      await sparkle.addDependency(itemA, itemB);

      const detailsAfter = await sparkle.getItemDetails(itemA);
      expect(detailsAfter.status).toBe('completed');
    });

    test('adding dependency does not change status of dependent items', async () => {
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

      expect(detailsA.status).toBe('completed');
      expect(detailsB.status).toBe('completed');
      expect(detailsC.status).toBe('completed');
    });
  });

  describe('Complex dependency graph', () => {
    test('handles complex dependency structure', async () => {
      // Create a complex graph
      const items = {};
      for (let i = 0; i < 6; i++) {
        items[`item${i}`] = await sparkle.createItem(`Item ${i}`);
      }

      // Build dependencies
      await sparkle.addDependency(items.item1, items.item0);
      await sparkle.addDependency(items.item2, items.item0);
      await sparkle.addDependency(items.item3, items.item1);
      await sparkle.addDependency(items.item3, items.item2);
      await sparkle.addDependency(items.item4, items.item2);
      await sparkle.addDependency(items.item5, items.item3);
      await sparkle.addDependency(items.item5, items.item4);

      // Verify dependencies
      const details3 = await sparkle.getItemDetails(items.item3);
      expect(details3.dependencies.length).toBe(2);
      expect(details3.dependencies).toContain(items.item1);
      expect(details3.dependencies).toContain(items.item2);

      const details5 = await sparkle.getItemDetails(items.item5);
      expect(details5.dependencies.length).toBe(2);
      expect(details5.dependencies).toContain(items.item3);
      expect(details5.dependencies).toContain(items.item4);
    });
  });
});
