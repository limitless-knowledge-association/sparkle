/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * DAG Tree Model test suite
 */

import { DagTreeModel } from '../../public/dagTreeModel.js';

// Mock DAG generator
async function* createMockDag(nodes) {
  for (const node of nodes) {
    yield node;
  }
}

describe('DAG Tree Model', () => {
  // ===== Initialization Tests =====

  describe('Initialization', () => {
    test('loads DAG data and populates cache', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData);

      expect(model.itemCache.size).toBe(2);
      expect(model.itemCache.has('A')).toBe(true);
      expect(model.itemCache.has('B')).toBe(true);
    });

    test('identifies roots correctly', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } },
        { item: 'C', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
      ]);

      await model.initialize(mockData);

      const roots = model.getRoots();
      expect(roots.length).toBe(2);
      expect(roots).toContain('A');
      expect(roots).toContain('C');
    });

    test('parses full dependency info', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B', 'C'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } },
        { item: 'C', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData);

      const itemA = model.getItemInfo('A');
      expect(itemA.dependsOn.size).toBe(2);
      expect(itemA.dependsOn.has('B')).toBe(true);
      expect(itemA.dependsOn.has('C')).toBe(true);

      const itemB = model.getItemInfo('B');
      expect(itemB.providesTo.size).toBe(1);
      expect(itemB.providesTo.has('A')).toBe(true);
    });
  });

  // ===== Visibility Tests =====

  describe('Visibility', () => {
    test('initially returns only roots', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: ['C'], providesTo: ['A'] } },
        { item: 'C', neededBy: 'B', depth: 2, full: { dependsOn: [], providesTo: ['B'] } }
      ]);

      await model.initialize(mockData);

      const visible = model.getTreeNodes();
      expect(visible.length).toBe(1);
      expect(visible[0].itemId).toBe('A');
    });

    test('expand makes children visible', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData);

      const treeNodes = model.getTreeNodes();
      const seqA = treeNodes[0].seq;

      model.expand(seqA);

      const visible = model.getTreeNodes();
      expect(visible.length).toBe(2);
      expect(visible[0].itemId).toBe('A');
      expect(visible[1].itemId).toBe('B');
    });

    test('collapse hides children', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData);

      let treeNodes = model.getTreeNodes();
      const seqA = treeNodes[0].seq;

      model.expand(seqA);
      let visible = model.getTreeNodes();
      expect(visible.length).toBe(2);

      model.collapse(seqA);
      visible = model.getTreeNodes();
      expect(visible.length).toBe(1);
      expect(visible[0].itemId).toBe('A');
    });

    test('nested expand shows deep children', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: ['C'], providesTo: ['A'] } },
        { item: 'C', neededBy: 'B', depth: 2, full: { dependsOn: [], providesTo: ['B'] } }
      ]);

      await model.initialize(mockData);

      let treeNodes = model.getTreeNodes();
      const seqA = treeNodes[0].seq;

      model.expand(seqA);
      treeNodes = model.getTreeNodes();
      const seqB = treeNodes[1].seq;

      model.expand(seqB);

      const visible = model.getTreeNodes();
      expect(visible.length).toBe(3);
      expect(visible[0].itemId).toBe('A');
      expect(visible[1].itemId).toBe('B');
      expect(visible[2].itemId).toBe('C');
    });

    test('expanded state tracks correctly', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData);

      let treeNodes = model.getTreeNodes();
      const seqA = treeNodes[0].seq;

      let nodeA = model.getTreeNode(seqA);
      expect(nodeA.expanded).toBe(false);

      model.expand(seqA);
      nodeA = model.getTreeNode(seqA);
      expect(nodeA.expanded).toBe(true);

      model.collapse(seqA);
      nodeA = model.getTreeNode(seqA);
      expect(nodeA.expanded).toBe(false);
    });

    test('toggle switches expand state', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData);

      const treeNodes = model.getTreeNodes();
      const seqA = treeNodes[0].seq;

      let nodeA = model.getTreeNode(seqA);
      expect(nodeA.expanded).toBe(false);

      model.toggle(seqA);
      nodeA = model.getTreeNode(seqA);
      expect(nodeA.expanded).toBe(true);

      model.toggle(seqA);
      nodeA = model.getTreeNode(seqA);
      expect(nodeA.expanded).toBe(false);
    });
  });

  // ===== State Preservation Tests =====

  describe('State Preservation', () => {
    test('update preserves expanded state', async () => {
      const model = new DagTreeModel();
      const mockData1 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData1);

      let treeNodes = model.getTreeNodes();
      const seqA = treeNodes[0].seq;
      model.expand(seqA);

      let nodeA = model.getTreeNode(seqA);
      expect(nodeA.expanded).toBe(true);

      const mockData2 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.update(mockData2);

      nodeA = model.getTreeNode(seqA);
      expect(nodeA.expanded).toBe(true);
    });

    test('update removes tree nodes for deleted items', async () => {
      const model = new DagTreeModel();
      const mockData1 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData1);

      let treeNodes = model.getTreeNodes();
      const seqA = treeNodes[0].seq;
      model.expand(seqA);

      treeNodes = model.getTreeNodes();
      const seqB = treeNodes[1].seq;

      const mockData2 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
      ]);

      await model.update(mockData2);

      const nodeA = model.getTreeNode(seqA);
      expect(nodeA).not.toBeNull();

      const itemB = model.getItemInfo('B');
      expect(itemB).toBeNull();
    });
  });

  // ===== Diff Tests =====

  describe('Diff Detection', () => {
    test('detects added items', async () => {
      const model = new DagTreeModel();
      const mockData1 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
      ]);

      await model.initialize(mockData1);

      const mockData2 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } },
        { item: 'B', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
      ]);

      const diff = await model.update(mockData2);

      expect(diff.added.length).toBe(1);
      expect(diff.added).toContain('B');
    });

    test('detects removed items', async () => {
      const model = new DagTreeModel();
      const mockData1 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } },
        { item: 'B', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
      ]);

      await model.initialize(mockData1);

      const mockData2 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
      ]);

      const diff = await model.update(mockData2);

      expect(diff.removed.length).toBe(1);
      expect(diff.removed).toContain('B');
    });

    test('detects changed dependsOn', async () => {
      const model = new DagTreeModel();
      const mockData1 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData1);

      const mockData2 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B', 'C'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } },
        { item: 'C', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      const diff = await model.update(mockData2);

      expect(diff.dependsOnChanged).toContain('A');
    });

    test('detects changed providesTo', async () => {
      const model = new DagTreeModel();
      const mockData1 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData1);

      const mockData2 = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A', 'C'] } },
        { item: 'C', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } }
      ]);

      const diff = await model.update(mockData2);

      expect(diff.providesToChanged).toContain('B');
    });
  });

  // ===== "Provides To" Logic Tests =====

  describe('Provides To Logic', () => {
    test('providesTo data is stored correctly', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A', 'C'] } },
        { item: 'C', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } }
      ]);

      await model.initialize(mockData);

      const itemB = model.getItemInfo('B');
      expect(itemB.providesTo.size).toBe(2);
      expect(itemB.providesTo.has('A')).toBe(true);
      expect(itemB.providesTo.has('C')).toBe(true);
    });

    test('tree expansion excludes origin from provider children', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A', 'C'] } },
        { item: 'C', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } }
      ]);

      await model.initialize(mockData);

      let treeNodes = model.getTreeNodes();
      const rootA = treeNodes.find(tn => tn.itemId === 'A');
      model.expand(rootA.seq);

      treeNodes = model.getTreeNodes();
      const nodeB = treeNodes.find(tn => tn.itemId === 'B');
      model.expand(nodeB.seq);

      treeNodes = model.getTreeNodes();
      const visibleItemIds = treeNodes.map(tn => tn.itemId);

      expect(visibleItemIds).toContain('A');
      expect(visibleItemIds).toContain('B');
      expect(visibleItemIds).toContain('C');

      const treeNodeB = model.getTreeNode(nodeB.seq);
      expect(treeNodeB.providerChildSeqs.length).toBe(1);
    });
  });

  // ===== Complex Graph Tests =====

  describe('Complex Graphs', () => {
    test('handles diamond structure correctly', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'D', neededBy: null, depth: 0, full: { dependsOn: ['B', 'C'], providesTo: [] } },
        { item: 'B', neededBy: 'D', depth: 1, full: { dependsOn: ['A'], providesTo: ['D'] } },
        { item: 'C', neededBy: 'D', depth: 1, full: { dependsOn: ['A'], providesTo: ['D'] } },
        { item: 'A', neededBy: 'B', depth: 2, full: { dependsOn: [], providesTo: ['B', 'C'] } },
        { item: 'A', neededBy: 'C', depth: 2 }
      ]);

      await model.initialize(mockData);

      expect(model.getRoots().length).toBe(1);
      expect(model.getRoots()[0]).toBe('D');

      const infoA = model.getItemInfo('A');
      expect(infoA.providesTo.size).toBe(2);
      expect(infoA.providesTo.has('B')).toBe(true);
      expect(infoA.providesTo.has('C')).toBe(true);
    });

    test('handles forest (multiple roots) correctly', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } },
        { item: 'B', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } },
        { item: 'C', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
      ]);

      await model.initialize(mockData);

      const roots = model.getRoots();
      expect(roots.length).toBe(3);

      const visible = model.getTreeNodes();
      expect(visible.length).toBe(3);
    });

    test('handles deep nesting correctly', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'L0', neededBy: null, depth: 0, full: { dependsOn: ['L1'], providesTo: [] } },
        { item: 'L1', neededBy: 'L0', depth: 1, full: { dependsOn: ['L2'], providesTo: ['L0'] } },
        { item: 'L2', neededBy: 'L1', depth: 2, full: { dependsOn: ['L3'], providesTo: ['L1'] } },
        { item: 'L3', neededBy: 'L2', depth: 3, full: { dependsOn: ['L4'], providesTo: ['L2'] } },
        { item: 'L4', neededBy: 'L3', depth: 4, full: { dependsOn: [], providesTo: ['L3'] } }
      ]);

      await model.initialize(mockData);

      let treeNodes = model.getTreeNodes();
      const seq0 = treeNodes.find(tn => tn.itemId === 'L0').seq;
      model.expand(seq0);

      treeNodes = model.getTreeNodes();
      const seq1 = treeNodes.find(tn => tn.itemId === 'L1').seq;
      model.expand(seq1);

      treeNodes = model.getTreeNodes();
      const seq2 = treeNodes.find(tn => tn.itemId === 'L2').seq;
      model.expand(seq2);

      treeNodes = model.getTreeNodes();
      const seq3 = treeNodes.find(tn => tn.itemId === 'L3').seq;
      model.expand(seq3);

      const visible = model.getTreeNodes();
      expect(visible.length).toBe(5);
      expect(visible[4].depth).toBe(4);
    });
  });

  // ===== Helper Method Tests =====

  describe('Helper Methods', () => {
    test('tree nodes have hasChildren property', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
      ]);

      await model.initialize(mockData);

      const treeNodes = model.getTreeNodes();
      const nodeA = treeNodes.find(tn => tn.itemId === 'A');

      expect(nodeA.hasChildren).toBe(true);
    });

    test('getAllItemIds returns all items', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
        { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } },
        { item: 'C', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
      ]);

      await model.initialize(mockData);

      const allIds = model.getAllItemIds();
      expect(allIds.length).toBe(3);
      expect(allIds).toContain('A');
      expect(allIds).toContain('B');
      expect(allIds).toContain('C');
    });
  });

  // ===== expandAll() Tests - Multi-Path Diamonds =====

  describe('expandAll', () => {
    test('shows all paths through complex diamond - providers and dependencies', async () => {
      const model = new DagTreeModel();
      const mockData = createMockDag([
        { item: 'ROOT', neededBy: null, depth: 0, full: { providesTo: ['p2', 'p1'], dependsOn: ['d1', 'd2'] } },
        { item: 'p2', neededBy: 'ROOT', depth: 1, full: { providesTo: ['p4'], dependsOn: ['ROOT'] } },
        { item: 'p1', neededBy: 'ROOT', depth: 1, full: { providesTo: ['p3'], dependsOn: ['ROOT'] } },
        { item: 'p4', neededBy: 'p2', depth: 2, full: { providesTo: ['p5'], dependsOn: ['p2'] } },
        { item: 'p3', neededBy: 'p1', depth: 2, full: { providesTo: ['p5'], dependsOn: ['p1'] } },
        { item: 'p5', neededBy: 'p4', depth: 3, full: { providesTo: [], dependsOn: ['p4', 'p3'] } },
        { item: 'p5', neededBy: 'p3', depth: 3 },
        { item: 'd1', neededBy: 'ROOT', depth: 1, full: { providesTo: ['ROOT'], dependsOn: ['d3'] } },
        { item: 'd2', neededBy: 'ROOT', depth: 1, full: { providesTo: ['ROOT'], dependsOn: ['d4'] } },
        { item: 'd3', neededBy: 'd1', depth: 2, full: { providesTo: ['d1', 'd4'], dependsOn: ['d5'] } },
        { item: 'd4', neededBy: 'd2', depth: 2, full: { providesTo: ['d2'], dependsOn: ['d3'] } },
        { item: 'd5', neededBy: 'd3', depth: 3, full: { providesTo: ['d3'], dependsOn: [] } },
        { item: 'd3', neededBy: 'd4', depth: 3 },
        { item: 'd5', neededBy: 'd3', depth: 4 }
      ]);

      await model.initialize(() => mockData, 'ROOT');

      const treeNodes = model.getTreeNodes();
      const anchorSeq = treeNodes.find(tn => tn.itemId === 'ROOT').seq;

      model.expandAll(anchorSeq);

      const visible = model.getTreeNodes();

      const p5Nodes = visible.filter(n => n.itemId === 'p5');
      expect(p5Nodes.length).toBe(2);
      expect(p5Nodes.every(n => n.depth === 3)).toBe(true);

      const d3Nodes = visible.filter(n => n.itemId === 'd3');
      expect(d3Nodes.length).toBe(2);
      const d3Depths = d3Nodes.map(n => n.depth).sort();
      expect(d3Depths[0]).toBe(2);
      expect(d3Depths[1]).toBe(3);

      const d5Nodes = visible.filter(n => n.itemId === 'd5');
      expect(d5Nodes.length).toBe(2);
      const d5Depths = d5Nodes.map(n => n.depth).sort();
      expect(d5Depths[0]).toBe(3);
      expect(d5Depths[1]).toBe(4);

      expect(visible[0].itemId).toBe('ROOT');
      expect(visible[0].depth).toBe(0);

      const providerSection = visible.slice(1, 7);
      expect(providerSection.every(n => n.relationType === 'provider')).toBe(true);

      const dependencySection = visible.slice(7);
      expect(dependencySection.every(n => n.relationType === 'dependency')).toBe(true);

      expect(visible.length).toBe(14);
    });
  });
});
