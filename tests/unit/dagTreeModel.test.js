/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * DAG Tree Model test suite
 */

import { DagTreeModel } from '../public/dagTreeModel.js';

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// Mock DAG generator
async function* createMockDag(nodes) {
  for (const node of nodes) {
    yield node;
  }
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
    console.log(`\nRunning ${this.tests.length} DAG Tree Model tests...\n`);

    for (const { name, fn } of this.tests) {
      try {
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
    }

    console.log(`\n${this.passed} passed, ${this.failed} failed\n`);
    process.exit(this.failed > 0 ? 1 : 0);
  }
}

const runner = new TestRunner();

// ===== Initialization Tests =====

runner.test('initialize loads DAG data and populates cache', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData);

  assertEqual(model.itemCache.size, 2, 'Should have 2 items in cache');
  assert(model.itemCache.has('A'), 'Should have item A');
  assert(model.itemCache.has('B'), 'Should have item B');
});

runner.test('initialize identifies roots correctly', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } },
    { item: 'C', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
  ]);

  await model.initialize(mockData);

  const roots = model.getRoots();
  assertEqual(roots.length, 2, 'Should have 2 roots');
  assert(roots.includes('A'), 'Should include root A');
  assert(roots.includes('C'), 'Should include root C');
});

runner.test('initialize parses full dependency info', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B', 'C'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } },
    { item: 'C', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData);

  const itemA = model.getItemInfo('A');
  assertEqual(itemA.dependsOn.size, 2, 'A should depend on 2 items');
  assert(itemA.dependsOn.has('B'), 'A should depend on B');
  assert(itemA.dependsOn.has('C'), 'A should depend on C');

  const itemB = model.getItemInfo('B');
  assertEqual(itemB.providesTo.size, 1, 'B should provide to 1 item');
  assert(itemB.providesTo.has('A'), 'B should provide to A');
});

// ===== Visibility Tests =====

runner.test('getTreeNodes initially returns only roots', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: ['C'], providesTo: ['A'] } },
    { item: 'C', neededBy: 'B', depth: 2, full: { dependsOn: [], providesTo: ['B'] } }
  ]);

  await model.initialize(mockData);

  const visible = model.getTreeNodes();
  assertEqual(visible.length, 1, 'Only root should be visible');
  assertEqual(visible[0].itemId, 'A', 'Root A should be visible');
});

runner.test('expand makes children visible', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData);

  // Get the sequence number for root A
  const treeNodes = model.getTreeNodes();
  const seqA = treeNodes[0].seq;

  model.expand(seqA);

  const visible = model.getTreeNodes();
  assertEqual(visible.length, 2, 'Root and child should be visible');
  assertEqual(visible[0].itemId, 'A', 'First should be root A');
  assertEqual(visible[1].itemId, 'B', 'Second should be child B');
});

runner.test('collapse hides children', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData);

  // Get the sequence number for root A
  let treeNodes = model.getTreeNodes();
  const seqA = treeNodes[0].seq;

  model.expand(seqA);
  let visible = model.getTreeNodes();
  assertEqual(visible.length, 2, 'Should have 2 visible after expand');

  model.collapse(seqA);
  visible = model.getTreeNodes();
  assertEqual(visible.length, 1, 'Should have 1 visible after collapse');
  assertEqual(visible[0].itemId, 'A', 'Only root should be visible');
});

runner.test('nested expand shows deep children', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: ['C'], providesTo: ['A'] } },
    { item: 'C', neededBy: 'B', depth: 2, full: { dependsOn: [], providesTo: ['B'] } }
  ]);

  await model.initialize(mockData);

  // Get sequence numbers
  let treeNodes = model.getTreeNodes();
  const seqA = treeNodes[0].seq;

  model.expand(seqA);
  treeNodes = model.getTreeNodes();
  const seqB = treeNodes[1].seq;

  model.expand(seqB);

  const visible = model.getTreeNodes();
  assertEqual(visible.length, 3, 'All items should be visible');
  assertEqual(visible[0].itemId, 'A');
  assertEqual(visible[1].itemId, 'B');
  assertEqual(visible[2].itemId, 'C');
});

runner.test('expanded state tracks correctly', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData);

  // Get sequence number for root A
  let treeNodes = model.getTreeNodes();
  const seqA = treeNodes[0].seq;

  let nodeA = model.getTreeNode(seqA);
  assert(!nodeA.expanded, 'A should not be expanded initially');

  model.expand(seqA);
  nodeA = model.getTreeNode(seqA);
  assert(nodeA.expanded, 'A should be expanded after expand()');

  model.collapse(seqA);
  nodeA = model.getTreeNode(seqA);
  assert(!nodeA.expanded, 'A should not be expanded after collapse()');
});

runner.test('toggle switches expand state', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData);

  // Get sequence number for root A
  const treeNodes = model.getTreeNodes();
  const seqA = treeNodes[0].seq;

  let nodeA = model.getTreeNode(seqA);
  assert(!nodeA.expanded, 'A should start collapsed');

  model.toggle(seqA);
  nodeA = model.getTreeNode(seqA);
  assert(nodeA.expanded, 'A should be expanded after first toggle');

  model.toggle(seqA);
  nodeA = model.getTreeNode(seqA);
  assert(!nodeA.expanded, 'A should be collapsed after second toggle');
});

// ===== State Preservation Tests =====

runner.test('update preserves expanded state', async () => {
  const model = new DagTreeModel();
  const mockData1 = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData1);

  // Get sequence number and expand
  let treeNodes = model.getTreeNodes();
  const seqA = treeNodes[0].seq;
  model.expand(seqA);

  let nodeA = model.getTreeNode(seqA);
  assert(nodeA.expanded, 'A should be expanded before update');

  const mockData2 = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.update(mockData2);

  // After update, tree node should still exist with same seq and be expanded
  nodeA = model.getTreeNode(seqA);
  assert(nodeA.expanded, 'A should still be expanded after update');
});

runner.test('update removes tree nodes for deleted items', async () => {
  const model = new DagTreeModel();
  const mockData1 = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData1);

  // Get sequence numbers and expand both
  let treeNodes = model.getTreeNodes();
  const seqA = treeNodes[0].seq;
  model.expand(seqA);

  treeNodes = model.getTreeNodes();
  const seqB = treeNodes[1].seq;

  const mockData2 = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
  ]);

  await model.update(mockData2);

  // A should still exist
  const nodeA = model.getTreeNode(seqA);
  assert(nodeA !== null, 'A should still exist');

  // B should be removed from item cache
  const itemB = model.getItemInfo('B');
  assert(itemB === null, 'B should no longer exist in item cache');
});

// ===== Diff Tests =====

runner.test('getDiff detects added items', async () => {
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

  assertEqual(diff.added.length, 1, 'Should have 1 added item');
  assert(diff.added.includes('B'), 'Should detect B as added');
});

runner.test('getDiff detects removed items', async () => {
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

  assertEqual(diff.removed.length, 1, 'Should have 1 removed item');
  assert(diff.removed.includes('B'), 'Should detect B as removed');
});

runner.test('getDiff detects changed dependsOn', async () => {
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

  assert(diff.dependsOnChanged.includes('A'), 'Should detect A\'s dependsOn changed');
});

runner.test('getDiff detects changed providesTo', async () => {
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

  assert(diff.providesToChanged.includes('B'), 'Should detect B\'s providesTo changed');
});

// ===== "Provides To" Logic Tests =====

runner.test('providesTo data is stored correctly', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A', 'C'] } },
    { item: 'C', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } }
  ]);

  await model.initialize(mockData);

  // B provides to both A and C
  const itemB = model.getItemInfo('B');
  assertEqual(itemB.providesTo.size, 2, 'B should provide to 2 items');
  assert(itemB.providesTo.has('A'), 'B should provide to A');
  assert(itemB.providesTo.has('C'), 'B should provide to C');
});

runner.test('tree expansion excludes origin from provider children', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A', 'C'] } },
    { item: 'C', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } }
  ]);

  await model.initialize(mockData);

  // Get root A and expand it
  let treeNodes = model.getTreeNodes();
  const rootA = treeNodes.find(tn => tn.itemId === 'A');
  model.expand(rootA.seq);

  // Now expand B (which is a child of A)
  treeNodes = model.getTreeNodes();
  const nodeB = treeNodes.find(tn => tn.itemId === 'B');
  model.expand(nodeB.seq);

  // After expanding B, we should see C as a provider child, but not A (the origin)
  treeNodes = model.getTreeNodes();
  const visibleItemIds = treeNodes.map(tn => tn.itemId);

  // We should see A, B, and C
  assert(visibleItemIds.includes('A'), 'Should see root A');
  assert(visibleItemIds.includes('B'), 'Should see B (dependency of A)');
  assert(visibleItemIds.includes('C'), 'Should see C (provider of B, excluding A)');

  // Verify B has provider children (C but not A)
  const treeNodeB = model.getTreeNode(nodeB.seq);
  assertEqual(treeNodeB.providerChildSeqs.length, 1, 'B should have 1 provider child (C, not A)');
});

// ===== Complex Graph Tests =====

runner.test('handles diamond structure correctly', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    //     D
    //    / \
    //   B   C
    //    \ /
    //     A
    { item: 'D', neededBy: null, depth: 0, full: { dependsOn: ['B', 'C'], providesTo: [] } },
    { item: 'B', neededBy: 'D', depth: 1, full: { dependsOn: ['A'], providesTo: ['D'] } },
    { item: 'C', neededBy: 'D', depth: 1, full: { dependsOn: ['A'], providesTo: ['D'] } },
    { item: 'A', neededBy: 'B', depth: 2, full: { dependsOn: [], providesTo: ['B', 'C'] } },
    { item: 'A', neededBy: 'C', depth: 2 } // Second encounter, no full
  ]);

  await model.initialize(mockData);

  assertEqual(model.getRoots().length, 1, 'Should have 1 root');
  assertEqual(model.getRoots()[0], 'D', 'Root should be D');

  const infoA = model.getItemInfo('A');
  assertEqual(infoA.providesTo.size, 2, 'A should provide to 2 items');
  assert(infoA.providesTo.has('B'), 'A should provide to B');
  assert(infoA.providesTo.has('C'), 'A should provide to C');
});

runner.test('handles forest (multiple roots) correctly', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } },
    { item: 'B', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } },
    { item: 'C', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
  ]);

  await model.initialize(mockData);

  const roots = model.getRoots();
  assertEqual(roots.length, 3, 'Should have 3 roots');

  const visible = model.getTreeNodes();
  assertEqual(visible.length, 3, 'All roots should be visible');
});

runner.test('handles deep nesting correctly', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'L0', neededBy: null, depth: 0, full: { dependsOn: ['L1'], providesTo: [] } },
    { item: 'L1', neededBy: 'L0', depth: 1, full: { dependsOn: ['L2'], providesTo: ['L0'] } },
    { item: 'L2', neededBy: 'L1', depth: 2, full: { dependsOn: ['L3'], providesTo: ['L1'] } },
    { item: 'L3', neededBy: 'L2', depth: 3, full: { dependsOn: ['L4'], providesTo: ['L2'] } },
    { item: 'L4', neededBy: 'L3', depth: 4, full: { dependsOn: [], providesTo: ['L3'] } }
  ]);

  await model.initialize(mockData);

  // Expand all - need to get sequence numbers at each step
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
  assertEqual(visible.length, 5, 'All 5 levels should be visible');
  assertEqual(visible[4].depth, 4, 'Deepest item should have depth 4');
});

// ===== Helper Method Tests =====

runner.test('tree nodes have hasChildren property', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData);

  const treeNodes = model.getTreeNodes();
  const nodeA = treeNodes.find(tn => tn.itemId === 'A');

  assert(nodeA.hasChildren, 'A should have children');
});

runner.test('getAllItemIds returns all items', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } },
    { item: 'C', neededBy: null, depth: 0, full: { dependsOn: [], providesTo: [] } }
  ]);

  await model.initialize(mockData);

  const allIds = model.getAllItemIds();
  assertEqual(allIds.length, 3, 'Should have 3 items');
  assert(allIds.includes('A'), 'Should include A');
  assert(allIds.includes('B'), 'Should include B');
  assert(allIds.includes('C'), 'Should include C');
});

// ===== expandAll() Tests - Multi-Path Diamonds =====

runner.test('expandAll shows all paths through complex diamond - providers and dependencies', async () => {
  const model = new DagTreeModel();
  // Structure:
  //      p5
  //     /  \
  //    p4  p3
  //    |   |
  //    p2  p1
  //     \ /
  //    ROOT (anchor)
  //     / \
  //    d1  d2
  //    |   |
  //    d3<-d4  (d3 depends on both d1 and d4)
  //    |
  //    d5
  const mockData = createMockDag([
    // ROOT is the anchor
    { item: 'ROOT', neededBy: null, depth: 0, full: { providesTo: ['p2', 'p1'], dependsOn: ['d1', 'd2'] } },
    // Providers (items that depend on ROOT, upward)
    { item: 'p2', neededBy: 'ROOT', depth: 1, full: { providesTo: ['p4'], dependsOn: ['ROOT'] } },
    { item: 'p1', neededBy: 'ROOT', depth: 1, full: { providesTo: ['p3'], dependsOn: ['ROOT'] } },
    { item: 'p4', neededBy: 'p2', depth: 2, full: { providesTo: ['p5'], dependsOn: ['p2'] } },
    { item: 'p3', neededBy: 'p1', depth: 2, full: { providesTo: ['p5'], dependsOn: ['p1'] } },
    { item: 'p5', neededBy: 'p4', depth: 3, full: { providesTo: [], dependsOn: ['p4', 'p3'] } },
    { item: 'p5', neededBy: 'p3', depth: 3 }, // Second path to p5
    // Dependencies (items ROOT depends on, downward)
    { item: 'd1', neededBy: 'ROOT', depth: 1, full: { providesTo: ['ROOT'], dependsOn: ['d3'] } },
    { item: 'd2', neededBy: 'ROOT', depth: 1, full: { providesTo: ['ROOT'], dependsOn: ['d4'] } },
    { item: 'd3', neededBy: 'd1', depth: 2, full: { providesTo: ['d1', 'd4'], dependsOn: ['d5'] } },
    { item: 'd4', neededBy: 'd2', depth: 2, full: { providesTo: ['d2'], dependsOn: ['d3'] } },
    { item: 'd5', neededBy: 'd3', depth: 3, full: { providesTo: ['d3'], dependsOn: [] } },
    { item: 'd3', neededBy: 'd4', depth: 3 }, // Second path to d3
    { item: 'd5', neededBy: 'd3', depth: 4 }  // Second path to d5 (via d2->d4->d3)
  ]);

  await model.initialize(() => mockData, 'ROOT');

  // Get anchor sequence (should be 1)
  const treeNodes = model.getTreeNodes();
  const anchorSeq = treeNodes.find(tn => tn.itemId === 'ROOT').seq;

  // Expand all from anchor
  model.expandAll(anchorSeq);

  // Get all visible nodes after expansion
  const visible = model.getTreeNodes();

  // Expected output order (as per diagram):
  // p5(3), p4(2), p2(1), p5(3), p3(2), p1(1), ROOT(0), d1(1), d3(2), d5(3), d2(1), d4(2), d3(3), d5(4)

  // Extract the sequence: itemId(depth)
  const sequence = visible.map(node => `${node.itemId}(${node.depth})`);

  console.log('\n  Actual sequence:', sequence.join(', '));

  // Verify structure:
  // 1. p5 should appear twice (at depth 3, via two different paths)
  const p5Nodes = visible.filter(n => n.itemId === 'p5');
  assertEqual(p5Nodes.length, 2, 'p5 should appear twice');
  assert(p5Nodes.every(n => n.depth === 3), 'Both p5 nodes should be at depth 3');

  // 2. d3 should appear twice (at depth 2 and depth 3)
  const d3Nodes = visible.filter(n => n.itemId === 'd3');
  assertEqual(d3Nodes.length, 2, 'd3 should appear twice');
  const d3Depths = d3Nodes.map(n => n.depth).sort();
  assertEqual(d3Depths[0], 2, 'First d3 should be at depth 2');
  assertEqual(d3Depths[1], 3, 'Second d3 should be at depth 3');

  // 3. d5 should appear twice (at depth 3 and depth 4)
  const d5Nodes = visible.filter(n => n.itemId === 'd5');
  assertEqual(d5Nodes.length, 2, 'd5 should appear twice');
  const d5Depths = d5Nodes.map(n => n.depth).sort();
  assertEqual(d5Depths[0], 3, 'First d5 should be at depth 3');
  assertEqual(d5Depths[1], 4, 'Second d5 should be at depth 4');

  // 4. Verify ROOT is first
  assertEqual(visible[0].itemId, 'ROOT', 'ROOT should be first');
  assertEqual(visible[0].depth, 0, 'ROOT should have depth 0');

  // 5. Verify providers come next (indices 1-6)
  const providerSection = visible.slice(1, 7);
  assert(providerSection.every(n => n.relationType === 'provider'), 'Nodes 1-6 should be providers');

  // 6. Verify dependencies come last (indices 7-13)
  const dependencySection = visible.slice(7);
  assert(dependencySection.every(n => n.relationType === 'dependency'), 'Nodes 7-13 should be dependencies');

  // 6. Verify total count: ROOT(1) + providers(p2,p4,p5,p1,p3,p5=6) + dependencies(d1,d3,d5,d2,d4,d3,d5=7) = 14
  assertEqual(visible.length, 14, 'Should have 14 total nodes (including duplicates)');
});

// Run all tests
runner.run();
