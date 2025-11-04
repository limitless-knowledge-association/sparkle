/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle DAG operations tests
 * Tests: getAllItemsAsDag with various graph structures and traversal modes
 */

import { setupSparkle } from './sparkle-test-helpers.js';

describe('Sparkle - DAG Operations', () => {
  let sparkle;

  beforeEach(async () => {
    sparkle = await setupSparkle('dag-tests');
  });

  describe('getAllItemsAsDag - Basic structures', () => {
    test('with no dependencies returns flat forest', async () => {
      const item1 = await sparkle.createItem('Task A');
      const item2 = await sparkle.createItem('Task B');
      const item3 = await sparkle.createItem('Task C');

      // All items are roots, so use item1 as reference
      const nodes = [];
      for await (const node of sparkle.getAllItemsAsDag(item1)) {
        nodes.push(node);
      }

      // Should have only 1 item (item1) since they're disconnected
      expect(nodes.length).toBe(1);
      expect(nodes[0].item).toBe(item1);
      expect(nodes[0].neededBy).toBe(null);
      expect(nodes[0].depth).toBe(0);
    });

    test('with simple chain', async () => {
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
      expect(nodes.length).toBe(3);

      // All items should be in the result
      const ids = nodes.map(n => n.item);
      expect(ids).toContain(item1);
      expect(ids).toContain(item2);
      expect(ids).toContain(item3);

      // First node should be reference (item1)
      expect(nodes[0].item).toBe(item1);
      expect(nodes[0].neededBy).toBe(null);
      expect(nodes[0].depth).toBe(0);
    });

    test('with diamond structure', async () => {
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
      expect(nodes.length).toBeGreaterThanOrEqual(4);

      // All items should be present
      const ids = nodes.map(n => n.item);
      expect(ids).toContain(itemD);
      expect(ids).toContain(itemB);
      expect(ids).toContain(itemC);
      expect(ids).toContain(itemA);

      // First node should be reference (itemD)
      expect(nodes[0].item).toBe(itemD);
      expect(nodes[0].depth).toBe(0);
      expect(nodes[0].neededBy).toBe(null);
    });

    test('with complex graph', async () => {
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
      expect(nodes.length).toBeGreaterThanOrEqual(5);

      // All items should be present
      const ids = nodes.map(n => n.item);
      expect(ids).toContain(itemE);
      expect(ids).toContain(itemA);
      expect(ids).toContain(itemB);
      expect(ids).toContain(itemC);
      expect(ids).toContain(itemD);

      // First node should be reference (itemE)
      expect(nodes[0].item).toBe(itemE);
      expect(nodes[0].depth).toBe(0);
      expect(nodes[0].neededBy).toBe(null);
    });
  });

  describe('getAllItemsAsDag - Full dependency information', () => {
    test('includes full dependencies on first encounter', async () => {
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
      expect(nodes.length).toBe(3);

      // Check itemA (root, depends on B, no one depends on it)
      const nodeA = nodes.find(n => n.item === itemA);
      expect(nodeA).toBeTruthy();
      expect(nodeA.full).toBeTruthy();
      expect(Array.isArray(nodeA.full.dependsOn)).toBe(true);
      expect(Array.isArray(nodeA.full.providesTo)).toBe(true);
      expect(nodeA.full.dependsOn.length).toBe(1);
      expect(nodeA.full.dependsOn[0]).toBe(itemB);
      expect(nodeA.full.providesTo.length).toBe(0);

      // Check itemB (depends on C, A depends on it)
      const nodeB = nodes.find(n => n.item === itemB);
      expect(nodeB).toBeTruthy();
      expect(nodeB.full).toBeTruthy();
      expect(nodeB.full.dependsOn.length).toBe(1);
      expect(nodeB.full.dependsOn[0]).toBe(itemC);
      expect(nodeB.full.providesTo.length).toBe(1);
      expect(nodeB.full.providesTo[0]).toBe(itemA);

      // Check itemC (no dependencies, B depends on it)
      const nodeC = nodes.find(n => n.item === itemC);
      expect(nodeC).toBeTruthy();
      expect(nodeC.full).toBeTruthy();
      expect(nodeC.full.dependsOn.length).toBe(0);
      expect(nodeC.full.providesTo.length).toBe(1);
      expect(nodeC.full.providesTo[0]).toBe(itemB);
    });

    test('omits full on subsequent encounters', async () => {
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
      expect(itemANodes.length).toBeGreaterThanOrEqual(1);
      expect(itemANodes[0].full).toBeTruthy();

      // If there's a second encounter, it should NOT have full
      if (itemANodes.length > 1) {
        expect(itemANodes[1].full).toBeFalsy();
      }

      // All first encounters should have full
      const uniqueItems = new Set();
      for (const node of nodes) {
        if (!uniqueItems.has(node.item)) {
          uniqueItems.add(node.item);
          expect(node.full).toBeTruthy();
        }
      }
    });

    test('full.dependsOn is accurate for multi-dependency item', async () => {
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
      expect(nodeD).toBeTruthy();
      expect(nodeD.full).toBeTruthy();
      expect(nodeD.full.dependsOn.length).toBe(3);

      // Check that all dependencies are present (order doesn't matter)
      expect(nodeD.full.dependsOn).toContain(itemA);
      expect(nodeD.full.dependsOn).toContain(itemB);
      expect(nodeD.full.dependsOn).toContain(itemC);
    });

    test('full.providesTo is accurate for shared dependency', async () => {
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
      expect(nodeD).toBeTruthy();
      expect(nodeD.full).toBeTruthy();
      expect(nodeD.full.providesTo.length).toBe(3);

      // Check that all dependents are present (order doesn't matter)
      expect(nodeD.full.providesTo).toContain(itemA);
      expect(nodeD.full.providesTo).toContain(itemB);
      expect(nodeD.full.providesTo).toContain(itemC);
    });

    test('full arrays are empty when no dependencies', async () => {
      // Create standalone item with no dependencies
      const item = await sparkle.createItem('Standalone');

      const nodes = [];
      for await (const node of sparkle.getAllItemsAsDag(item)) {
        nodes.push(node);
      }

      expect(nodes.length).toBe(1);
      expect(nodes[0].full).toBeTruthy();
      expect(nodes[0].full.dependsOn.length).toBe(0);
      expect(nodes[0].full.providesTo.length).toBe(0);
    });
  });

  describe('getAllItemsAsDag - Parameter validation', () => {
    test('requires referenceId parameter', async () => {
      const item = await sparkle.createItem('Test Item');

      await expect(async () => {
        for await (const node of sparkle.getAllItemsAsDag()) {
          // Should not reach here
        }
      }).rejects.toThrow(/referenceId/);
    });

    test('throws error for invalid referenceId', async () => {
      const item = await sparkle.createItem('Test Item');

      await expect(async () => {
        for await (const node of sparkle.getAllItemsAsDag('99999999')) {
          // Should not reach here
        }
      }).rejects.toThrow(/not found/);
    });
  });

  describe('getAllItemsAsDag - Bidirectional traversal', () => {
    test('bidirectional traversal from leaf node', async () => {
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
      expect(nodes.length).toBe(3);

      const ids = nodes.map(n => n.item);
      expect(ids).toContain(leaf);
      expect(ids).toContain(middle);
      expect(ids).toContain(root);

      // First node should be the reference (leaf)
      expect(nodes[0].item).toBe(leaf);
      expect(nodes[0].neededBy).toBe(null);
    });

    test('bidirectional traversal from middle node', async () => {
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
      expect(nodes.length).toBe(3);

      const ids = nodes.map(n => n.item);
      expect(ids).toContain(leaf);
      expect(ids).toContain(middle);
      expect(ids).toContain(root);
    });

    test('only returns connected component', async () => {
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

      expect(nodes.length).toBe(1);
      expect(nodes[0].item).toBe(item1);
    });
  });
});
