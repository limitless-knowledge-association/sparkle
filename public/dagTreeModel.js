/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * DAG Tree Model - Pure logic for tree state management
 * No DOM dependencies - fully testable
 *
 * Key concepts:
 * - Item nodes: The DAG data (items with dependencies)
 * - Tree nodes: Visual nodes with sequence numbers for user interaction
 */

/**
 * Represents a single tree node (visual element)
 */
class TreeNode {
  constructor(seq, itemId, origin, parentSeq) {
    this.seq = seq;           // Sequence number (for user interaction)
    this.itemId = itemId;     // Which item this represents
    this.origin = origin;     // The parent tree node's itemId (where we came from)
    this.parentSeq = parentSeq; // Parent tree node sequence number
    this.expanded = false;    // Whether this tree node is expanded
    this.dependencyChildSeqs = []; // Sequence numbers of dependency child tree nodes
    this.providerChildSeqs = [];   // Sequence numbers of provider child tree nodes
  }
}

/**
 * Model for managing DAG tree state without DOM dependencies
 * Maintains separate tree nodes (with sequence numbers) from item data
 */
export class DagTreeModel {
  constructor() {
    // Cache of all items: itemId -> {dependsOn: Set, providesTo: Set, neededBy, depth, tagline}
    this.itemCache = new Map();

    // Tree nodes: seq -> TreeNode
    this.treeNodes = new Map();

    // Root item IDs (those with neededBy === null)
    this.rootItemIds = [];

    // Next sequence number to assign
    this.nextSeq = 1;

    // Store the data source for updates
    this.currentDataSource = null;
  }

  /**
   * Initialize the model with DAG data
   * @param {AsyncGenerator|Function} dataSource - Generator that yields DAG nodes, or function that returns generator
   * @param {string|null} anchorItemId - Optional: Start tree from this item instead of roots
   */
  async initialize(dataSource, anchorItemId = null) {
    this.currentDataSource = dataSource;
    await this._loadData(dataSource);

    if (anchorItemId) {
      // Create tree starting from specific anchor item
      this._createAnchorTreeNode(anchorItemId);
    } else {
      // Create tree starting from roots (default behavior)
      this._createRootTreeNodes();
    }
  }

  /**
   * Load DAG data and populate item cache
   * @param {AsyncGenerator|Function} dataSource - Generator that yields DAG nodes, or function that returns generator
   * @private
   */
  async _loadData(dataSource) {
    this.itemCache.clear();
    this.rootItemIds = [];

    const seenItems = new Set();

    // If dataSource is a function, call it to get the generator
    const generator = typeof dataSource === 'function' ? dataSource() : dataSource;

    for await (const node of generator) {
      const { item, neededBy, depth, full } = node;

      // On first encounter, we get full dependency info
      if (full && !seenItems.has(item)) {
        seenItems.add(item);

        this.itemCache.set(item, {
          itemId: item,
          dependsOn: new Set(full.dependsOn),
          providesTo: new Set(full.providesTo),
          neededBy,
          depth
        });

        // Track roots (items with no parent)
        if (neededBy === null) {
          this.rootItemIds.push(item);
        }
      }
    }
  }

  /**
   * Create initial tree nodes for roots
   * @private
   */
  _createRootTreeNodes() {
    this.treeNodes.clear();
    this.nextSeq = 1;

    for (const rootItemId of this.rootItemIds) {
      const treeNode = new TreeNode(this.nextSeq++, rootItemId, null, null);
      this.treeNodes.set(treeNode.seq, treeNode);
    }
  }

  /**
   * Create a single tree node for anchor item (inspector mode)
   * @param {string} itemId - Anchor item ID
   * @private
   */
  _createAnchorTreeNode(itemId) {
    this.treeNodes.clear();
    this.nextSeq = 1;

    // Verify item exists in cache
    if (!this.itemCache.has(itemId)) {
      throw new Error(`Anchor item ${itemId} not found in cache`);
    }

    // Create root tree node for this item
    const treeNode = new TreeNode(this.nextSeq++, itemId, null, null);
    this.treeNodes.set(treeNode.seq, treeNode);
  }

  /**
   * Get all tree nodes in display order
   * @returns {Array<Object>} Array of tree node data
   */
  getTreeNodes() {
    const result = [];

    // Get root tree nodes (those with parentSeq === null)
    const rootSeqs = Array.from(this.treeNodes.values())
      .filter(tn => tn.parentSeq === null)
      .map(tn => tn.seq);

    for (const seq of rootSeqs) {
      this._collectTreeNodes(seq, 0, result);
    }

    return result;
  }

  /**
   * Recursively collect tree nodes for display
   * @private
   */
  _collectTreeNodes(seq, depth, result) {
    const treeNode = this.treeNodes.get(seq);
    if (!treeNode) return;

    const itemInfo = this.itemCache.get(treeNode.itemId);
    if (!itemInfo) return;

    // Determine if this node has potential children
    const hasDependencies = itemInfo.dependsOn.size > 0;
    const hasProviders = this._getProvidersExcludingOrigin(treeNode.itemId, treeNode.origin).length > 0;
    const hasChildren = hasDependencies || hasProviders;

    // Determine relationship type: root (no origin), dependency, or provider
    let relationType = 'root';
    if (treeNode.origin !== null && treeNode.parentSeq !== null) {
      const parentNode = this.treeNodes.get(treeNode.parentSeq);
      if (parentNode) {
        // Check if this node is in parent's dependencyChildSeqs or providerChildSeqs
        if (parentNode.dependencyChildSeqs.includes(seq)) {
          relationType = 'dependency';
        } else if (parentNode.providerChildSeqs.includes(seq)) {
          relationType = 'provider';
        }
      }
    }

    result.push({
      seq: treeNode.seq,
      itemId: treeNode.itemId,
      origin: treeNode.origin,
      parentSeq: treeNode.parentSeq,
      expanded: treeNode.expanded,
      hasChildren,
      depth,
      relationType // 'root', 'dependency', or 'provider'
    });

    // If expanded, recurse into all children
    // Providers first (upward), then dependencies (downward) for inspector display
    if (treeNode.expanded) {
      for (const childSeq of treeNode.providerChildSeqs) {
        this._collectTreeNodes(childSeq, depth + 1, result);
      }

      for (const childSeq of treeNode.dependencyChildSeqs) {
        this._collectTreeNodes(childSeq, depth + 1, result);
      }
    }
  }

  /**
   * Expand a tree node (by sequence number)
   * @param {number} seq - Tree node sequence number
   * @param {string|null} direction - 'providers', 'dependencies', or null for both
   */
  expand(seq, direction = null) {
    const treeNode = this.treeNodes.get(seq);
    if (!treeNode) {
      throw new Error(`Tree node ${seq} not found`);
    }

    if (treeNode.expanded) {
      throw new Error(`Tree node ${seq} is already expanded`);
    }

    const itemInfo = this.itemCache.get(treeNode.itemId);
    if (!itemInfo) {
      throw new Error(`Item ${treeNode.itemId} not found in cache`);
    }

    // Mark as expanded
    treeNode.expanded = true;
    treeNode.dependencyChildSeqs = [];
    treeNode.providerChildSeqs = [];

    // Create tree nodes for dependencies (if direction allows)
    if (direction === null || direction === 'dependencies') {
      for (const depItemId of itemInfo.dependsOn) {
        const childNode = new TreeNode(this.nextSeq++, depItemId, treeNode.itemId, seq);
        this.treeNodes.set(childNode.seq, childNode);
        treeNode.dependencyChildSeqs.push(childNode.seq);
      }
    }

    // Create tree nodes for providers (excluding origin, if direction allows)
    if (direction === null || direction === 'providers') {
      const providers = this._getProvidersExcludingOrigin(treeNode.itemId, treeNode.origin);
      if (providers.length > 0) {
        for (const provItemId of providers) {
          const provNode = new TreeNode(this.nextSeq++, provItemId, treeNode.itemId, seq);
          this.treeNodes.set(provNode.seq, provNode);
          treeNode.providerChildSeqs.push(provNode.seq);
        }
      }
    }
  }

  /**
   * Collapse a tree node (by sequence number)
   * @param {number} seq - Tree node sequence number
   */
  collapse(seq) {
    const treeNode = this.treeNodes.get(seq);
    if (!treeNode) {
      throw new Error(`Tree node ${seq} not found`);
    }

    if (!treeNode.expanded) {
      throw new Error(`Tree node ${seq} is not expanded`);
    }

    // Recursively delete all child tree nodes
    this._deleteTreeNodeChildren(seq);

    // Mark as collapsed
    treeNode.expanded = false;
    treeNode.dependencyChildSeqs = [];
    treeNode.providerChildSeqs = [];
  }

  /**
   * Recursively delete child tree nodes
   * @private
   */
  _deleteTreeNodeChildren(seq) {
    const treeNode = this.treeNodes.get(seq);
    if (!treeNode) return;

    for (const childSeq of [...treeNode.dependencyChildSeqs, ...treeNode.providerChildSeqs]) {
      this._deleteTreeNodeChildren(childSeq);
      this.treeNodes.delete(childSeq);
    }
  }

  /**
   * Toggle expand/collapse state
   * @param {number} seq - Tree node sequence number
   */
  toggle(seq) {
    const treeNode = this.treeNodes.get(seq);
    if (!treeNode) {
      throw new Error(`Tree node ${seq} not found`);
    }

    if (treeNode.expanded) {
      this.collapse(seq);
    } else {
      this.expand(seq);
    }
  }

  /**
   * Get providers for an item, excluding the origin
   * @private
   */
  _getProvidersExcludingOrigin(itemId, origin) {
    const itemInfo = this.itemCache.get(itemId);
    if (!itemInfo) return [];

    const providers = Array.from(itemInfo.providesTo);

    // Exclude origin if it exists in providers
    if (origin !== null) {
      return providers.filter(id => id !== origin);
    }

    return providers;
  }

  /**
   * Get dependencies for an item, excluding the origin
   * @private
   */
  _getDependenciesExcludingOrigin(itemId, origin) {
    const itemInfo = this.itemCache.get(itemId);
    if (!itemInfo) return [];

    const dependencies = Array.from(itemInfo.dependsOn);

    // Exclude origin if it exists in dependencies
    if (origin !== null) {
      return dependencies.filter(id => id !== origin);
    }

    return dependencies;
  }

  /**
   * Get item info from cache
   * @param {string} itemId - Item ID
   * @returns {Object|null} Item info
   */
  getItemInfo(itemId) {
    return this.itemCache.get(itemId) || null;
  }

  /**
   * Get tree node by sequence number
   * @param {number} seq - Sequence number
   * @returns {Object|null} Tree node
   */
  getTreeNode(seq) {
    return this.treeNodes.get(seq) || null;
  }

  /**
   * Get all item IDs in the cache
   * @returns {Array<string>}
   */
  getAllItemIds() {
    return Array.from(this.itemCache.keys());
  }

  /**
   * Get root item IDs
   * @returns {Array<string>}
   */
  getRoots() {
    return [...this.rootItemIds];
  }

  /**
   * Check if any of the given itemIds affect the current view
   * (i.e., are they in the item cache)
   * @param {Array<string>} itemIds - Array of item IDs to check
   * @returns {boolean} True if at least one item is in the cache
   */
  affectsCurrentView(itemIds) {
    return itemIds.some(itemId => this.itemCache.has(itemId));
  }

  /**
   * Create a tree node for a specific item (used by inspector to start from anchor)
   * @param {string} itemId - Item ID to create tree node for
   * @returns {number} Sequence number of the created tree node
   */
  createTreeNodeForItem(itemId) {
    // Check if item exists in cache
    if (!this.itemCache.has(itemId)) {
      throw new Error(`Item ${itemId} not found in cache`);
    }

    // Check if a tree node already exists for this item as a root
    for (const [seq, treeNode] of this.treeNodes.entries()) {
      if (treeNode.itemId === itemId && treeNode.parentSeq === null) {
        return seq; // Already exists as root
      }
    }

    // Create new root tree node for this item
    const treeNode = new TreeNode(this.nextSeq++, itemId, null, null);
    this.treeNodes.set(treeNode.seq, treeNode);
    return treeNode.seq;
  }

  /**
   * Recursively expand all tree nodes starting from a given sequence number
   * Used by inspector to show fully-expanded tree
   * Performs two separate BFS traversals: upward (providers) and downward (dependencies)
   * @param {number} seq - Starting sequence number (anchor)
   * @returns {Array<number>} Array of all sequence numbers that were expanded
   */
  expandAll(seq) {
    const expanded = [];
    const visitedSeqsProviders = new Set(); // Track tree node seqs visited in provider direction
    const visitedSeqsDependencies = new Set(); // Track tree node seqs visited in dependency direction

    // First, expand the anchor node itself (creates both provider and dependency children)
    const anchorNode = this.treeNodes.get(seq);
    if (!anchorNode) {
      return expanded;
    }

    if (!anchorNode.expanded) {
      this.expand(seq, null); // Expand in both directions for anchor
      expanded.push(seq);
    }

    // BFS upward through providers only
    const providerQueue = [...anchorNode.providerChildSeqs];
    let iterations = 0;
    const MAX_ITERATIONS = 200;

    while (providerQueue.length > 0) {
      iterations++;
      if (iterations > MAX_ITERATIONS) {
        throw new Error(`expandAll provider BFS exceeded ${MAX_ITERATIONS} iterations`);
      }

      const currentSeq = providerQueue.shift();

      // Skip if we've already processed this tree node
      if (visitedSeqsProviders.has(currentSeq)) continue;
      visitedSeqsProviders.add(currentSeq);

      const node = this.treeNodes.get(currentSeq);
      if (!node) continue;

      // Expand this node in providers direction only
      if (!node.expanded) {
        this.expand(currentSeq, 'providers');
        expanded.push(currentSeq);
      }

      // Always add children to queue (each tree node gets fully expanded)
      providerQueue.push(...node.providerChildSeqs);
    }

    // BFS downward through dependencies only
    const dependencyQueue = [...anchorNode.dependencyChildSeqs];
    iterations = 0;

    while (dependencyQueue.length > 0) {
      iterations++;
      if (iterations > MAX_ITERATIONS) {
        throw new Error(`expandAll dependency BFS exceeded ${MAX_ITERATIONS} iterations`);
      }

      const currentSeq = dependencyQueue.shift();

      // Skip if we've already processed this tree node
      if (visitedSeqsDependencies.has(currentSeq)) continue;
      visitedSeqsDependencies.add(currentSeq);

      const node = this.treeNodes.get(currentSeq);
      if (!node) continue;

      // Expand this node in dependencies direction only
      if (!node.expanded) {
        this.expand(currentSeq, 'dependencies');
        expanded.push(currentSeq);
      }

      // Always add children to queue (each tree node gets fully expanded)
      dependencyQueue.push(...node.dependencyChildSeqs);
    }

    return expanded;
  }

  /**
   * Get statistics about the tree
   * @returns {Object}
   */
  getStats() {
    const itemCount = this.itemCache.size;
    const rootCount = this.rootItemIds.length;
    const treeNodeCount = this.treeNodes.size;
    const expandedCount = Array.from(this.treeNodes.values()).filter(tn => tn.expanded).length;

    return {
      itemCount,
      rootCount,
      treeNodeCount,
      expandedCount
    };
  }

  /**
   * Synchronize children of an expanded node with current data
   * Adds tree nodes for new children, removes tree nodes for children that no longer exist
   * @param {number} seq - Tree node sequence number
   */
  syncChildren(seq) {
    const treeNode = this.treeNodes.get(seq);
    if (!treeNode || !treeNode.expanded) {
      return; // Only sync expanded nodes
    }

    const itemInfo = this.itemCache.get(treeNode.itemId);
    if (!itemInfo) {
      return;
    }

    // Sync dependencies
    const currentDepIds = new Set(
      treeNode.dependencyChildSeqs.map(childSeq => {
        const child = this.treeNodes.get(childSeq);
        return child ? child.itemId : null;
      }).filter(id => id !== null)
    );

    const actualDepIds = itemInfo.dependsOn;

    // Remove tree nodes for dependencies that no longer exist
    for (const childSeq of [...treeNode.dependencyChildSeqs]) {
      const child = this.treeNodes.get(childSeq);
      if (child && !actualDepIds.has(child.itemId)) {
        // This dependency no longer exists, remove it
        this._deleteTreeNodeChildren(childSeq);
        this.treeNodes.delete(childSeq);
        treeNode.dependencyChildSeqs = treeNode.dependencyChildSeqs.filter(s => s !== childSeq);
      }
    }

    // Add tree nodes for new dependencies
    for (const depItemId of actualDepIds) {
      if (!currentDepIds.has(depItemId)) {
        // This is a new dependency, add it
        const childNode = new TreeNode(this.nextSeq++, depItemId, treeNode.itemId, seq);
        this.treeNodes.set(childNode.seq, childNode);
        treeNode.dependencyChildSeqs.push(childNode.seq);
      }
    }

    // Sync providers
    const currentProvIds = new Set(
      treeNode.providerChildSeqs.map(childSeq => {
        const child = this.treeNodes.get(childSeq);
        return child ? child.itemId : null;
      }).filter(id => id !== null)
    );

    const actualProviders = this._getProvidersExcludingOrigin(treeNode.itemId, treeNode.origin);
    const actualProvIds = new Set(actualProviders);

    // Remove tree nodes for providers that no longer exist
    for (const childSeq of [...treeNode.providerChildSeqs]) {
      const child = this.treeNodes.get(childSeq);
      if (child && !actualProvIds.has(child.itemId)) {
        // This provider no longer exists, remove it
        this._deleteTreeNodeChildren(childSeq);
        this.treeNodes.delete(childSeq);
        treeNode.providerChildSeqs = treeNode.providerChildSeqs.filter(s => s !== childSeq);
      }
    }

    // Add tree nodes for new providers
    for (const provItemId of actualProviders) {
      if (!currentProvIds.has(provItemId)) {
        // This is a new provider, add it
        const childNode = new TreeNode(this.nextSeq++, provItemId, treeNode.itemId, seq);
        this.treeNodes.set(childNode.seq, childNode);
        treeNode.providerChildSeqs.push(childNode.seq);
      }
    }
  }

  /**
   * Update the tree with new data
   * Re-reads data source and applies changes while preserving expansion state
   * @param {AsyncGenerator|Function} dataSource - Data source
   * @returns {Object|null} Diff information
   */
  async update(dataSource) {
    // Save old cache for diffing
    const oldCache = new Map(this.itemCache);
    const oldRootItemIds = [...this.rootItemIds];

    // Reload data (updates itemCache and rootItemIds)
    await this._loadData(dataSource);

    // Remove root tree nodes for items that are no longer roots
    const currentRootItemIdsSet = new Set(this.rootItemIds);
    const rootTreeNodesToRemove = [];

    for (const [seq, treeNode] of this.treeNodes.entries()) {
      if (treeNode.parentSeq === null && !currentRootItemIdsSet.has(treeNode.itemId)) {
        // This was a root tree node but the item is no longer a root
        rootTreeNodesToRemove.push(seq);
      }
    }

    for (const seq of rootTreeNodesToRemove) {
      this._deleteTreeNodeChildren(seq);
      this.treeNodes.delete(seq);
    }

    // Add tree nodes for any new root items
    // Don't clear existing tree nodes - keep them intact!
    for (const rootItemId of this.rootItemIds) {
      // Check if we already have a root tree node for this item
      const existingRootNode = Array.from(this.treeNodes.values())
        .find(tn => tn.parentSeq === null && tn.itemId === rootItemId);

      if (!existingRootNode) {
        // Create new root tree node for this item
        const treeNode = new TreeNode(this.nextSeq++, rootItemId, null, null);
        this.treeNodes.set(treeNode.seq, treeNode);
      }
    }

    // Calculate diff
    const diff = this._calculateDiff(oldCache, this.itemCache);

    return diff;
  }

  /**
   * Calculate diff between old and new data
   * @private
   */
  _calculateDiff(oldCache, newCache) {
    const added = [];
    const removed = [];
    const dependsOnChanged = [];
    const providesToChanged = [];

    // Find added and changed items
    for (const [itemId, newInfo] of newCache) {
      const oldInfo = oldCache.get(itemId);

      if (!oldInfo) {
        added.push(itemId);
      } else {
        // Check if dependencies changed
        const oldDeps = Array.from(oldInfo.dependsOn).sort();
        const newDeps = Array.from(newInfo.dependsOn).sort();
        if (JSON.stringify(oldDeps) !== JSON.stringify(newDeps)) {
          dependsOnChanged.push(itemId);
        }

        // Check if providers changed
        const oldProvs = Array.from(oldInfo.providesTo).sort();
        const newProvs = Array.from(newInfo.providesTo).sort();
        if (JSON.stringify(oldProvs) !== JSON.stringify(newProvs)) {
          providesToChanged.push(itemId);
        }
      }
    }

    // Find removed items
    for (const itemId of oldCache.keys()) {
      if (!newCache.has(itemId)) {
        removed.push(itemId);
      }
    }

    return {
      added,
      removed,
      dependsOnChanged,
      providesToChanged
    };
  }
}
