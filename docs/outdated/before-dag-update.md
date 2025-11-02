# DAG Tree View Plan (Before DAG Update)

## Plan: Create DAG Tree Viewer with Lazy Rendering

### 1. Create `src/dagTreeView.js` - Main Tree View Module
- **Export main function**: `async function renderDagTree(containerId, dataSource, options)`
  - `containerId`: string ID of the div to populate
  - `dataSource`: async generator (like `getAllItemsAsDag()`)
  - `options`: optional config (event handlers, cache strategy)
- **Cache Management**:
  - Load entire DAG into memory on first call
  - Store as: `Map<itemId, {item, neededBy, depth, details}>`
  - Make all access async (future-proof for LRU caching)
- **Lazy Rendering**:
  - Initially render only root items (depth 0)
  - On expand (+): render immediate dependencies
  - On collapse (-): hide child nodes
  - Track expanded/collapsed state per item
- **"ProvidesTo" Section**:
  - For each item, calculate reverse dependencies
  - Filter out the immediate parent (neededBy)
  - Show as a separate subsection in the tree node
- **Event System**:
  - Emit custom events on item click: `dag-item-clicked` with `{itemId, element}`
  - Allow consumers to attach event listeners

### 2. Create Tree Node Structure
Each node will have:
- **Visual elements**: +/- toggle, item ID/tagline, dependencies container
- **Data attributes**: `data-item-id`, `data-depth`, `data-expanded`
- **Sections**:
  - "Depends On" (immediate dependencies)
  - "ProvidesTo" (other reverse dependencies, excluding parent)

### 3. Create `tests/dagTreeView.test.js` - Unit Tests
Using the existing custom test runner pattern:
- **Test 1**: Render empty DAG (no items)
- **Test 2**: Render single root item
- **Test 3**: Render multiple roots
- **Test 4**: Expand/collapse functionality
- **Test 5**: Lazy loading (only expanded nodes render children)
- **Test 6**: "ProvidesTo" section shows correct reverse deps
- **Test 7**: Event emission on item click
- **Test 8**: Caching behavior (DAG loaded once)
- **Test 9**: Complex graph with multiple paths
- **Mock data source**: Create async generator that yields test DAG data

### 4. HTML/CSS Structure
- Use semantic HTML with classes for styling
- Indent children with CSS (margin-left or padding)
- Style +/- controls as clickable buttons
- Make nodes visually distinct (borders, backgrounds)
- Ensure accessibility (keyboard navigation, ARIA attributes)

### 5. Key Implementation Details
- **Reverse dependency calculation**: Build a `Map<itemId, Set<dependentIds>>` from DAG data
- **Tree traversal**: Use cached data to find children on-demand
- **DOM management**: Use document fragments for efficient rendering
- **CSS classes**: `.dag-tree`, `.dag-node`, `.dag-toggle`, `.dag-depends-on`, `.dag-provides-to`

### 6. Future-Proofing
- All cache access is async (ready for LRU)
- Modular design allows swapping cache implementation
- Event system allows flexible integration

The module will be:
- Browser-compatible (no Node.js dependencies)
- Testable with mock data
- Reusable and configurable

## Why This Plan Needs DAG Update First

The original plan had the tree viewer responsible for:
1. Calculating reverse dependencies from the DAG stream
2. Building forward/backward navigation maps
3. Finding all "ProvidesTo" relationships

This is inefficient because:
- The tree viewer shouldn't need to traverse the entire graph to find relationships
- It duplicates logic that should be in the DAG generator
- Makes caching more complex than necessary

## Updated Approach

**DAG Generator Enhancement** (to be done first):
- Modify `getAllItemsAsDag()` to include full relationship data on first encounter
- Each item's first yield includes: `{item, neededBy, depth, full: [all dependencies]}`
- Subsequent encounters (due to multiple paths) yield: `{item, neededBy, depth}` (no `full`)
- This allows one-pass cache population with complete forward/backward relationships

**Tree Viewer Benefits** (after DAG update):
- Simply consume the enhanced DAG stream
- Cache has all relationships pre-populated
- No need to traverse or calculate - just render from cache
- "ProvidesTo" is directly available from cached reverse dependencies
