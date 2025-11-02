# Plan: DAG Tree View with Separated Model and Rendering Layers

## Architecture: Model-View Separation

**Core Principle:** Separate tree logic (testable) from rendering (DOM or console)

### Module Structure

1. **`src/dagTreeModel.js`** - Pure logic, no DOM (fully testable)
2. **`src/dagTreeRenderer.js`** - DOM rendering (thin layer, manual testing)
3. **`src/dagTreeConsole.js`** - Console rendering (for demos/debugging)
4. **`tests/dagTreeModel.test.js`** - Comprehensive model tests

---

## Phase 1: Core Model (`src/dagTreeModel.js`)

**Responsibilities:**
- Load and cache DAG data
- Track expanded/collapsed state
- Calculate visible nodes based on expand state
- Diff old vs new data
- Determine what to add/remove/update
- Handle "Provides To" logic (filter out current parent)

**Class: `DagTreeModel`**

### Constructor and Initialization
```javascript
class DagTreeModel {
  constructor() {
    this.cache = new Map(); // itemId -> {dependsOn: Set, providesTo: Set, ...}
    this.expandedItems = new Set(); // Track expanded items
    this.roots = []; // Root item IDs
    this.currentDataSource = null;
  }

  async initialize(dataSource) {
    // Load initial DAG data
    // Populate cache with full dependency info
    // Identify roots
  }
}
```

### State Management Methods
```javascript
expand(itemId) // Mark item as expanded
collapse(itemId) // Mark item as collapsed
toggle(itemId) // Toggle expand/collapse state
isExpanded(itemId) // Check if expanded
```

### Data Query Methods
```javascript
getVisibleItems() // Returns [{itemId, depth, parent, hasChildren}, ...]
  // Only returns items that should be visible based on expand state

getItemInfo(itemId) // Returns cached info for item

getDependsOn(itemId) // Returns array of dependencies

getProvidesTo(itemId, excludeParent) // Returns providers, optionally excluding parent
  // This implements: providesTo - [current parent] logic
```

### Update Methods
```javascript
async update(dataSource) {
  // Re-read DAG stream
  // Build new cache
  // Diff against old cache
  // Return change delta: {added: [], removed: [], updated: []}
  // Preserve expandedItems state
}

getDiff(oldCache, newCache) {
  // Returns: {
  //   added: [itemId, ...],
  //   removed: [itemId, ...],
  //   dependsOnChanged: [itemId, ...],
  //   providesToChanged: [itemId, ...]
  // }
}
```

### Helper Methods
```javascript
getTreeStructure() {
  // Returns nested object representation of visible tree
  // Used by console renderer
  return {
    roots: [
      {
        itemId: '00000001',
        expanded: true,
        dependsOn: [...],
        providesTo: [...],
        children: [...]
      }
    ]
  }
}

getItemPath(itemId) {
  // Returns path from root to item: ['root', 'parent', 'itemId']
  // Useful for rendering indentation
}
```

---

## Phase 2: Console Renderer (`src/dagTreeConsole.js`)

**Responsibilities:**
- Render tree structure to console using box-drawing characters
- Show expand/collapse state
- Display dependencies and "Provides To" sections
- Beautiful, hierarchical output

**Example Output:**
```
DAG Tree View
═════════════
├─[+] 00000001: Implement authentication
│  └─ Depends On:
│     └─ 00000002: Design auth system
│  └─ Provides To:
│     └─ 00000005: Deploy to production
│
├─[-] 00000002: Design auth system
│  │
│  ├─ [+] 00000003: Research OAuth providers
│  │  └─ Depends On: (none)
│  │  └─ Provides To:
│  │     └─ 00000002 (parent shown above)
│  │
│  └─ [+] 00000004: Create database schema
│
└─[+] 00000005: Deploy to production
   └─ Depends On:
      └─ 00000001: Implement authentication
   └─ Provides To: (none)
```

**Key Functions:**
```javascript
function renderToConsole(model) {
  // Uses model.getTreeStructure()
  // Outputs formatted tree to console.log
}

function renderNode(node, indent, isLast) {
  // Recursive rendering with proper indentation
  // Box-drawing characters: ├─ └─ │
}
```

---

## Phase 3: DOM Renderer (`src/dagTreeRenderer.js`)

**Responsibilities:**
- Render model state to DOM
- Handle user interactions (click, expand/collapse)
- Apply incremental updates based on model diff
- Emit custom events for item clicks

**Key Functions:**

```javascript
class DagTreeRenderer {
  constructor(containerId, model, options) {
    this.container = document.getElementById(containerId);
    this.model = model;
    this.options = options; // {onItemClick: fn}
    this.domNodes = new Map(); // itemId -> DOM element
  }

  render() {
    // Initial render from model.getVisibleItems()
    // Creates DOM structure
  }

  update(diff) {
    // Apply incremental changes based on diff
    // Remove nodes for diff.removed
    // Add nodes for diff.added (only if parent expanded)
    // Update sections for diff.dependsOnChanged, diff.providesToChanged
  }

  renderItem(itemId, parentElement) {
    // Create DOM structure for single item:
    // <div class="dag-node" data-item-id="...">
    //   <button class="dag-toggle">+/-</button>
    //   <span class="dag-item-label" onclick="emit('item-clicked')">itemId</span>
    //   <div class="dag-depends-on">...</div>
    //   <div class="dag-provides-to">...</div>
    // </div>
  }

  attachEventListeners(element, itemId) {
    // Toggle expand/collapse
    // Item click events
  }
}
```

---

## Phase 4: Main API (`src/dagTreeView.js`)

**Responsibilities:**
- Unified API for both console and DOM rendering
- Manages model lifecycle
- Subscribes to data updates
- Coordinates model and renderer

```javascript
export class DagTreeView {
  constructor(dataSource, renderMode, options) {
    this.model = new DagTreeModel();
    this.dataSource = dataSource;
    this.renderMode = renderMode; // 'console' or 'dom'
    this.renderer = null;
    this.options = options;
  }

  async initialize(containerIdOrNull) {
    await this.model.initialize(this.dataSource);

    if (this.renderMode === 'console') {
      this.renderer = new ConsoleRenderer();
      this.renderer.render(this.model);
    } else if (this.renderMode === 'dom') {
      this.renderer = new DomRenderer(containerIdOrNull, this.model, this.options);
      this.renderer.render();
    }
  }

  async update() {
    const diff = await this.model.update(this.dataSource);

    if (this.renderMode === 'console') {
      // Full re-render for console (fast, no flashing in terminal)
      this.renderer.render(this.model);
    } else {
      // Incremental update for DOM (preserve state)
      this.renderer.update(diff);
    }
  }

  expand(itemId) {
    this.model.expand(itemId);
    if (this.renderMode === 'console') {
      this.renderer.render(this.model);
    } else {
      this.renderer.renderChildren(itemId);
    }
  }

  collapse(itemId) {
    this.model.collapse(itemId);
    if (this.renderMode === 'console') {
      this.renderer.render(this.model);
    } else {
      this.renderer.hideChildren(itemId);
    }
  }
}

// Convenience factory functions
export async function createConsoleTree(dataSource) {
  const tree = new DagTreeView(dataSource, 'console');
  await tree.initialize();
  return tree;
}

export async function createDomTree(containerId, dataSource, options) {
  const tree = new DagTreeView(dataSource, 'dom', options);
  await tree.initialize(containerId);
  return tree;
}
```

---

## Phase 5: Comprehensive Model Tests (`tests/dagTreeModel.test.js`)

**Test Categories:**

### 5.1 Initialization Tests
- Load DAG data and populate cache
- Identify roots correctly
- Parse full dependency info on first encounter

### 5.2 Visibility Tests
- Initially only roots are visible
- After expand, children become visible
- After collapse, children not visible
- Nested expand/collapse works correctly

### 5.3 State Preservation Tests
- After update, expanded items stay expanded
- After update, collapsed items stay collapsed
- Expand state persists across multiple updates

### 5.4 Diff Tests
- Detect added items
- Detect removed items
- Detect changed dependsOn relationships
- Detect changed providesTo relationships

### 5.5 "Provides To" Logic Tests
- providesTo correctly excludes current parent
- When viewing A via P, getProvidesTo(A, P) doesn't include P
- Multiple paths handled correctly

### 5.6 Update Tests
- Update with new item appears only if parent expanded
- Update with removed item removed from visible list
- Update with changed dependency reflected in model
- Rapid updates handled correctly

### 5.7 Complex Graph Tests
- Diamond structure handled correctly
- Forest (multiple roots) works
- Deep nesting (10+ levels)
- Many dependencies (item depends on 20+ others)

**Example Test:**
```javascript
runner.test('expand makes children visible', async () => {
  const model = new DagTreeModel();
  const mockData = createMockDag([
    { item: 'A', neededBy: null, depth: 0, full: { dependsOn: ['B'], providesTo: [] } },
    { item: 'B', neededBy: 'A', depth: 1, full: { dependsOn: [], providesTo: ['A'] } }
  ]);

  await model.initialize(mockData);

  let visible = model.getVisibleItems();
  assertEqual(visible.length, 1, 'Only root should be visible');
  assertEqual(visible[0].itemId, 'A');

  model.expand('A');

  visible = model.getVisibleItems();
  assertEqual(visible.length, 2, 'Root and child should be visible');
  assert(visible.some(v => v.itemId === 'B'), 'Child B should be visible');
});
```

---

## Phase 6: Console Demo/Test Script (`examples/tree-demo.js`)

**Purpose:**
- Demonstrate console rendering
- Interactive demo for testing
- Can be run during development

```javascript
import { createConsoleTree } from '../src/dagTreeView.js';
import * as sparkle from '../src/sparkle.js';

async function demo() {
  sparkle.setBaseDirectory('./sparkle-data');

  console.log('Loading DAG tree...\n');
  const tree = await createConsoleTree(() => sparkle.getAllItemsAsDag());

  console.log('\nExpanding item 00000001...\n');
  tree.expand('00000001');

  console.log('\nSimulating update...\n');
  await tree.update();

  console.log('\nCollapsing item 00000001...\n');
  tree.collapse('00000001');
}

demo().catch(console.error);
```

---

## Phase 7: Server Event Broadcasting

**File: `bin/sparkle_agent.js`**

Add broadcast after successful data changes:

```javascript
// In performFetch() after line 290
if (result.changed) {
  broadcastSSE('dataUpdated', { timestamp: Date.now() });
}

// In commitChanges() after line 330
broadcastSSE('dataUpdated', { timestamp: Date.now() });
```

---

## Phase 8: Browser Integration

**Usage in `public/user_operation.html` or new page:**

```javascript
import { createDomTree } from '/src/dagTreeView.js';

let dagTree = null;

async function initializeTree() {
  dagTree = await createDomTree('tree-container',
    () => fetch('/api/getAllItemsAsDag').then(r => r.json()),
    {
      onItemClick: (itemId) => {
        viewItem(itemId); // Existing function
      }
    }
  );
}

// Subscribe to SSE events
eventSource.addEventListener('dataUpdated', async () => {
  if (dagTree) {
    await dagTree.update();
  }
});
```

---

## Key Benefits

### Testing Benefits:
- ✅ **100% testable logic** - Model has zero DOM dependencies
- ✅ **Fast tests** - Pure JavaScript, no DOM overhead
- ✅ **Console visualization** - Can see tree structure in terminal
- ✅ **Easy debugging** - Console renderer shows exact state
- ✅ **No external dependencies** - Works with existing test runner

### User Benefits:
- ✅ **No flashing** - DOM renderer applies minimal updates
- ✅ **State preservation** - Expanded nodes stay expanded
- ✅ **Efficient** - Only updates visible changes
- ✅ **Automatic updates** - Reacts to server events
- ✅ **Bidirectional navigation** - "Provides To" enables graph traversal

### Developer Benefits:
- ✅ **Console demos** - Can demo in terminal
- ✅ **Clean separation** - Logic vs presentation
- ✅ **Multiple renderers** - Easy to add new output formats
- ✅ **Mockable data** - Tests use simple mock generators

---

## Success Criteria

1. All model tests pass (20+ tests)
2. Console renderer produces readable tree output
3. DOM renderer updates without flashing
4. Expanded state preserved across updates
5. "Provides To" correctly excludes parent
6. Works with real Sparkle data
7. Interactive console demo works
8. Browser integration receives and applies updates

---

## Implementation Order

1. `src/dagTreeModel.js` - Core logic
2. `tests/dagTreeModel.test.js` - Comprehensive tests
3. Run tests, fix issues
4. `src/dagTreeConsole.js` - Console renderer
5. `examples/tree-demo.js` - Console demo
6. Manual testing with console output
7. `src/dagTreeRenderer.js` - DOM renderer
8. `src/dagTreeView.js` - Unified API
9. Server event broadcasting
10. Browser integration
