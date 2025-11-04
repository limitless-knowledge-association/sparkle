/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle - A system to keep track of all the details
 * Main API class (Facade)
 */

import { join } from 'path';
import { readMatchingFiles, readJsonFile, getItemFiles } from './fileUtils.js';
import { buildItemState, buildAllActiveDependencies } from './stateBuilder.js';
import { getItemsDependingOn, wouldCreateCycle } from './dependencyGraph.js';
import { getItemDetails as utilsGetItemDetails, getAllItemFiles as utilsGetAllItemFiles, getAllowedStatuses as utilsGetAllowedStatuses } from './utils.js';

// Aggregate Model
import { AggregateModel } from './AggregateModel.js';

// Git Operations
import { GitOperations } from './GitOperations.js';

// Controllers
import * as itemController from './controllers/itemController.js';
import * as taglineController from './controllers/taglineController.js';
import * as entryController from './controllers/entryController.js';
import * as statusController from './controllers/statusController.js';
import * as dependencyController from './controllers/dependencyController.js';
import * as monitorController from './controllers/monitorController.js';
import * as ignoredController from './controllers/ignoredController.js';
import * as takenController from './controllers/takenController.js';

// Configuration Manager
import * as configManager from './configManager.js';

// System Aggregates
import { rebuildStatusesAggregate } from './statusesAggregate.js';
import { rebuildTakersAggregate } from './takersAggregate.js';

/**
 * Sparkle API Class
 * Provides the main interface for interacting with Sparkle
 */
export class Sparkle {
  /**
   * Create a Sparkle instance
   * @param {string} baseDirectory - Base directory for sparkle data (defaults to './sparkle-data')
   * @param {AggregateModel} aggregateModel - Aggregate model instance (optional, will create default if not provided)
   * @param {GitOperations} gitOps - Git operations instance (optional, will create default if not provided)
   */
  constructor(baseDirectory = './sparkle-data', aggregateModel = null, gitOps = null) {
    this.baseDirectory = baseDirectory;
    this.aggregateModel = aggregateModel || new AggregateModel(baseDirectory);
    this.gitOps = gitOps || new GitOperations(baseDirectory);
    this.initialized = false;
  }

  /**
   * Initialize the Sparkle instance
   * Must be called before using any other methods
   * @returns {Promise<void>}
   */
  async start() {
    // Initialize aggregate model
    await this.aggregateModel.start();

    // Rebuild system aggregates on startup
    await rebuildStatusesAggregate(this.baseDirectory);
    await rebuildTakersAggregate(this.baseDirectory);

    // Wire up git pull callback to invalidate aggregates
    this.gitOps.onFilesPulled(async (filenames) => {
      await this.aggregateModel.invalidateAggregatesForFiles(filenames);
    });

    this.initialized = true;
  }

  /**
   * Stop the Sparkle instance and clean up resources
   * Cancels any pending git operations
   * @returns {Promise<void>}
   */
  async stop() {
    // Cancel any pending git commit operations in GitOperations
    if (this.gitOps) {
      this.gitOps.cancelPendingCommit();
    }

    this.initialized = false;
  }

  /**
   * Check if initialized and throw if not
   * @private
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Sparkle not initialized. Call start() first.');
    }
  }

  /**
   * Get all allowed statuses (for UI purposes)
   * @returns {Promise<Array<string>>} Array of allowed statuses
   */
  async getAllowedStatuses() {
    this._ensureInitialized();
    return await utilsGetAllowedStatuses(this.baseDirectory);
  }

  /**
   * Update the allowed statuses configuration
   * @param {Array<string>} statuses - Array of all status names (frontend sends full list)
   * @returns {Promise<Array<string>>} The new complete list of statuses (including 'incomplete' and 'completed')
   */
  async updateStatuses(statuses) {
    this._ensureInitialized();
    return await statusController.updateStatusConfiguration(this.baseDirectory, statuses, this.gitOps);
  }

  /**
   * Create a new item
   * @param {string} tagline - Short description of the item
   * @param {string} [status='incomplete'] - Initial status
   * @param {string} [initialEntry] - Optional initial entry text
   * @returns {Promise<string>} Item ID
   */
  async createItem(tagline, status = 'incomplete', initialEntry) {
    this._ensureInitialized();

    const itemId = await itemController.createItem(this.baseDirectory, tagline, status, initialEntry, this.aggregateModel, this.gitOps);

    return itemId;
  }

  /**
   * Get item details (from aggregates)
   * @param {string} itemId - Item identifier
   * @returns {Promise<Object>} Deep copy of item details
   */
  async getItemDetails(itemId) {
    this._ensureInitialized();

    const startTime = Date.now();
    const aggregate = await this.aggregateModel.getAggregate(itemId);

    if (!aggregate) {
      throw new Error(`Item ${itemId} does not exist`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Core] getItemDetails(${itemId}) - source: aggregate, duration: ${duration}ms`);

    // Return deep copy
    return JSON.parse(JSON.stringify(aggregate));
  }

  /**
   * Alter the tagline of an item
   * @param {string} itemId - Item identifier
   * @param {string} tagline - New tagline
   */
  async alterTagline(itemId, tagline) {
    this._ensureInitialized();

    await taglineController.alterTagline(this.baseDirectory, itemId, tagline, this.aggregateModel, this.gitOps);
  }

  /**
   * Add an entry to an item
   * @param {string} itemId - Item identifier
   * @param {string} text - Entry text
   */
  async addEntry(itemId, text) {
    this._ensureInitialized();

    await entryController.addEntry(this.baseDirectory, itemId, text, this.aggregateModel, this.gitOps);
  }

  /**
   * Update the status of an item
   * @param {string} itemId - Item identifier
   * @param {string} status - New status
   * @param {string} text - Optional text describing the status change
   */
  async updateStatus(itemId, status, text = '') {
    this._ensureInitialized();

    await statusController.updateStatus(this.baseDirectory, itemId, status, text, this.aggregateModel, this.gitOps);
  }

  /**
   * Add a dependency relationship
   * @param {string} itemNeeding - Item that needs the dependency
   * @param {string} itemNeeded - Item that is needed
   */
  async addDependency(itemNeeding, itemNeeded) {
    this._ensureInitialized();

    await dependencyController.addDependency(this.baseDirectory, itemNeeding, itemNeeded, this.aggregateModel, this.gitOps);
  }

  /**
   * Remove a dependency relationship
   * @param {string} itemNeeding - Item that needed the dependency
   * @param {string} itemNeeded - Item that was needed
   */
  async removeDependency(itemNeeding, itemNeeded) {
    this._ensureInitialized();

    await dependencyController.removeDependency(this.baseDirectory, itemNeeding, itemNeeded, this.aggregateModel, this.gitOps);
  }

  /**
   * Add a monitor to an item
   * @param {string} itemId - Item identifier
   */
  async addMonitor(itemId) {
    this._ensureInitialized();

    await monitorController.addMonitor(this.baseDirectory, itemId, this.aggregateModel, this.gitOps);
  }

  /**
   * Remove a monitor from an item
   * @param {string} itemId - Item identifier
   */
  async removeMonitor(itemId) {
    this._ensureInitialized();

    await monitorController.removeMonitor(this.baseDirectory, itemId, this.aggregateModel, this.gitOps);
  }

  /**
   * Mark an item as ignored
   * @param {string} itemId - Item identifier
   */
  async ignoreItem(itemId) {
    this._ensureInitialized();

    await ignoredController.ignoreItem(this.baseDirectory, itemId, this.aggregateModel, this.gitOps);
  }

  /**
   * Remove ignore flag from an item
   * @param {string} itemId - Item identifier
   */
  async unignoreItem(itemId) {
    this._ensureInitialized();

    await ignoredController.unignoreItem(this.baseDirectory, itemId, this.aggregateModel, this.gitOps);
  }

  /**
   * Take responsibility for an item
   * @param {string} itemId - Item identifier
   */
  async takeItem(itemId) {
    this._ensureInitialized();

    await takenController.takeItem(this.baseDirectory, itemId, this.aggregateModel, this.gitOps);
  }

  /**
   * Surrender responsibility for an item
   * @param {string} itemId - Item identifier
   */
  async surrenderItem(itemId) {
    this._ensureInitialized();

    await takenController.surrenderItem(this.baseDirectory, itemId, this.aggregateModel, this.gitOps);
  }

  /**
   * Get all items
   * @returns {Promise<Array>} Array of items sorted by creation timestamp
   */
  async getAllItems() {
    this._ensureInitialized();

    const startTime = Date.now();
    console.log('[Core] getAllItems() - source: aggregates');

    const aggStartTime = Date.now();
    const aggregates = await this.aggregateModel.getAllAggregates();
    const aggDuration = Date.now() - aggStartTime;

    // Sort by creation timestamp (most recent first)
    const sortStartTime = Date.now();
    const items = aggregates.sort((a, b) => {
      const aTime = a.createdTimestamp || '0';
      const bTime = b.createdTimestamp || '0';
      return bTime.localeCompare(aTime);
    });
    const sortDuration = Date.now() - sortStartTime;

    const totalDuration = Date.now() - startTime;
    console.log(`[Core] getAllItems() - fetchAggregates: ${aggDuration}ms, sort: ${sortDuration}ms, total: ${totalDuration}ms, count: ${items.length}`);

    return items;
  }

  /**
   * Get items that are ready to work on (pending work)
   * @returns {AsyncGenerator} Async generator yielding item IDs
   */
  async *pendingWork() {
    this._ensureInitialized();

    const aggregates = await this.aggregateModel.getAllAggregates();

    // Build aggregate map for quick lookup
    const allAggregates = new Map();
    for (const aggregate of aggregates) {
      allAggregates.set(aggregate.itemId, aggregate);
    }

    // Check each item
    for (const aggregate of aggregates) {
      // Skip if already completed
      if (aggregate.status === 'completed') {
        continue;
      }

      // Check if all dependencies are met
      const deps = aggregate.dependencies || [];
      let allDependenciesMet = true;

      if (deps.length > 0) {
        for (const depId of deps) {
          const depAggregate = allAggregates.get(depId);
          if (!depAggregate || depAggregate.status !== 'completed') {
            allDependenciesMet = false;
            break;
          }
        }
      }

      // If not completed and all dependencies met, it's pending work
      if (allDependenciesMet) {
        yield aggregate.itemId;
      }
    }
  }

  /**
   * Get all items as a DAG (for dependency visualization)
   * Performs bidirectional traversal from a reference item, traversing both
   * up through providers (dependents) and down through dependencies.
   *
   * @param {string} referenceId - The item ID to use as the reference point for traversal (required)
   * @returns {AsyncGenerator} Async generator yielding DAG nodes
   * @throws {Error} If referenceId is not provided or doesn't exist
   */
  async *getAllItemsAsDag(referenceId) {
    const dagStart = Date.now();
    console.log(`[DAG] getAllItemsAsDag(${referenceId}) - START`);
    this._ensureInitialized();

    // Validate referenceId is provided
    if (!referenceId) {
      throw new Error('referenceId parameter is required for getAllItemsAsDag()');
    }

    const aggStart = Date.now();
    const aggregates = await this.aggregateModel.getAllAggregates();
    console.log(`[DAG] getAllAggregates: ${Date.now() - aggStart}ms, count: ${aggregates.length}`);

    // Build dependency graph
    const graphStart = Date.now();
    const dependsOn = new Map();
    const providesTo = new Map();

    for (const agg of aggregates) {
      dependsOn.set(agg.itemId, new Set(agg.dependencies));

      // Build reverse dependencies
      for (const depId of agg.dependencies) {
        if (!providesTo.has(depId)) {
          providesTo.set(depId, new Set());
        }
        providesTo.get(depId).add(agg.itemId);
      }
    }
    console.log(`[DAG] Built dependency graph: ${Date.now() - graphStart}ms`);

    // Verify reference item exists
    const referenceAgg = aggregates.find(a => a.itemId === referenceId);
    if (!referenceAgg) {
      throw new Error(`Reference item ${referenceId} not found`);
    }

    // Bidirectional BFS traversal from reference item
    const visited = new Set();
    const emitted = new Set();
    const traverseStart = Date.now();
    console.log(`[DAG] Starting bidirectional traversal from reference: ${referenceId}`);

    async function* traverseBidirectional(startItemId) {
      const queue = [{ itemId: startItemId, neededBy: null, depth: 0 }];

      while (queue.length > 0) {
        const { itemId, neededBy, depth } = queue.shift();

        if (visited.has(itemId)) {
          // Already processing this item (cycle or revisit)
          if (emitted.has(itemId)) {
            // Already emitted, just emit reference marker
            yield { item: itemId, neededBy, depth };
          }
          continue;
        }

        visited.add(itemId);

        const agg = aggregates.find(a => a.itemId === itemId);
        if (!agg) {
          continue;
        }

        // Emit this item with full data (first encounter)
        const deps = dependsOn.get(itemId) || new Set();
        const provs = providesTo.get(itemId) || new Set();

        yield {
          item: itemId,
          neededBy,
          depth,
          full: {
            ...agg,
            dependsOn: Array.from(deps),
            providesTo: Array.from(provs)
          }
        };

        emitted.add(itemId);

        // Add dependencies (downward traversal) to queue
        for (const depId of deps) {
          if (!visited.has(depId)) {
            queue.push({ itemId: depId, neededBy: itemId, depth: depth + 1 });
          }
        }

        // Add providers (upward traversal) to queue
        for (const provId of provs) {
          if (!visited.has(provId)) {
            queue.push({ itemId: provId, neededBy: itemId, depth: depth + 1 });
          }
        }
      }
    }

    let nodeCount = 0;
    for await (const node of traverseBidirectional(referenceId)) {
      nodeCount++;
      yield node;
    }

    console.log(`[DAG] Traversal complete: ${Date.now() - traverseStart}ms, nodes: ${nodeCount}`);
    console.log(`[DAG] getAllItemsAsDag(${referenceId}) - COMPLETE: ${Date.now() - dagStart}ms`);
  }

  /**
   * Get root items (items with no providers/dependents)
   * Useful for tree view to determine starting points for DAG traversal
   *
   * @returns {Promise<Array<{itemId: string, hasChildren: boolean}>>} Array of root item objects
   */
  async getRootItems() {
    this._ensureInitialized();

    const aggregates = await this.aggregateModel.getAllAggregates();

    // Build providers map
    const providesTo = new Map();
    for (const agg of aggregates) {
      for (const depId of agg.dependencies) {
        if (!providesTo.has(depId)) {
          providesTo.set(depId, new Set());
        }
        providesTo.get(depId).add(agg.itemId);
      }
    }

    // Find roots (items with no providers)
    const roots = aggregates
      .filter(agg => {
        const providers = providesTo.get(agg.itemId);
        return !providers || providers.size === 0;
      })
      .map(agg => ({
        itemId: agg.itemId,
        hasChildren: agg.dependencies.length > 0
      }));

    return roots;
  }

  /**
   * Get potential dependencies for an item
   * @param {string} itemId - Item identifier
   * @returns {Promise<Object>} Object with current and candidates arrays
   */
  async getPotentialDependencies(itemId) {
    this._ensureInitialized();

    // Get item details
    const item = await this.getItemDetails(itemId);

    // Get all items
    const allAggregates = await this.aggregateModel.getAllAggregates();

    // Current dependencies
    const current = item.dependencies.map(depId => {
      const agg = allAggregates.find(a => a.itemId === depId);
      return agg || { itemId: depId, tagline: 'Unknown' };
    });

    // Build dependency graph for cycle detection
    const dependsOn = new Map();
    for (const agg of allAggregates) {
      dependsOn.set(agg.itemId, new Set(agg.dependencies));
    }

    // Candidates are all items except self and those that would create cycles
    const candidates = allAggregates.filter(agg => {
      if (agg.itemId === itemId) {
        return false; // Can't depend on self
      }

      if (item.dependencies.includes(agg.itemId)) {
        return false; // Already a dependency
      }

      // Check if adding this would create a cycle
      return !wouldCreateCycle(itemId, agg.itemId, dependsOn);
    });

    return { current, candidates };
  }

  /**
   * Get potential dependents for an item
   * @param {string} itemId - Item identifier
   * @returns {Promise<Object>} Object with current and candidates arrays
   */
  async getPotentialDependents(itemId) {
    this._ensureInitialized();

    // Get all items
    const allAggregates = await this.aggregateModel.getAllAggregates();

    // Find items that currently depend on this item
    const current = allAggregates.filter(agg => agg.dependencies.includes(itemId));

    // Build dependency graph for cycle detection
    const dependsOn = new Map();
    for (const agg of allAggregates) {
      dependsOn.set(agg.itemId, new Set(agg.dependencies));
    }

    // Candidates are all items except self and those that would create cycles
    const candidates = allAggregates.filter(agg => {
      if (agg.itemId === itemId) {
        return false; // Can't depend on self
      }

      if (agg.dependencies.includes(itemId)) {
        return false; // Already depends on this
      }

      // Check if making agg depend on itemId would create a cycle
      return !wouldCreateCycle(agg.itemId, itemId, dependsOn);
    });

    return { current, candidates };
  }

  /**
   * Get audit trail for an item
   * @param {string} itemId - Item identifier
   * @returns {AsyncGenerator} Async generator yielding audit events
   */
  async *getItemAuditTrail(itemId) {
    this._ensureInitialized();

    // Verify item exists
    await this.getItemDetails(itemId);

    const files = await getItemFiles(this.baseDirectory, itemId);

    // Get all files from all items to find reverse dependencies
    const allFiles = await readMatchingFiles(this.baseDirectory, '');
    const reverseDependencyFiles = [];

    // Find dependency files where OTHER items depend on THIS item
    // Format: otherItemId.dependency.linked/unlinked.itemId.timestamp.random.json
    for (const filename of allFiles) {
      const parts = filename.split('.');

      // Check if this is a dependency file
      if (parts.length >= 5 && parts[1] === 'dependency') {
        const action = parts[2]; // 'linked' or 'unlinked'
        const targetItemId = parts[3]; // the item being depended upon

        // If the target is our itemId, this is a reverse dependency
        if (targetItemId === itemId && (action === 'linked' || action === 'unlinked')) {
          const filePath = join(this.baseDirectory, filename);
          const data = await readJsonFile(filePath);
          reverseDependencyFiles.push({ filename, data });
        }
      }
    }

    // Combine files for this item with reverse dependency files
    const allAuditFiles = [...files, ...reverseDependencyFiles];

    // Sort all files by timestamp
    allAuditFiles.sort((a, b) => {
      const partsA = a.filename.split('.');
      const partsB = b.filename.split('.');

      // For base item file (itemId.json), use the created timestamp
      const timestampA = partsA.length === 2
        ? a.data.created
        : partsA[partsA.length - 3]; // timestamp is 3rd from the end

      const timestampB = partsB.length === 2
        ? b.data.created
        : partsB[partsB.length - 3];

      return String(timestampA).localeCompare(String(timestampB));
    });

    // Process each file and generate audit trail entries
    for (const file of allAuditFiles) {
      const parts = file.filename.split('.');
      const fileItemId = parts[0]; // The item this file belongs to

      // Initial item creation: itemId.json
      if (parts.length === 2 && parts[1] === 'json') {
        const isoTimestamp = file.data.created;
        yield {
          timestamp: isoTimestamp,
          type: 'created',
          person: file.data.person,
          status: file.data.status
        };
        continue;
      }

      // Other record types
      const recordType = parts[1];
      const isoTimestamp = file.data.person.timestamp;
      const person = file.data.person;

      switch (recordType) {
        case 'tagline':
          yield {
            timestamp: isoTimestamp,
            type: 'tagline',
            tagline: file.data.tagline,
            person: person
          };
          break;

        case 'entry':
          yield {
            timestamp: isoTimestamp,
            type: 'entry',
            text: file.data.text,
            person: person
          };
          break;

        case 'status':
          yield {
            timestamp: isoTimestamp,
            type: 'status',
            status: file.data.status,
            text: file.data.text || '',
            person: person
          };
          break;

        case 'dependency':
          {
            const action = parts[2]; // 'linked' or 'unlinked'
            const otherItemId = parts[3];

            // Check if this is a reverse dependency
            const isReverseDependency = fileItemId !== itemId;

            yield {
              timestamp: isoTimestamp,
              type: 'dependency',
              action: action,
              reverse: isReverseDependency,
              relatedItemId: isReverseDependency ? fileItemId : otherItemId,
              person: person
            };
          }
          break;

        case 'monitor':
          {
            const monitorAction = parts[2]; // 'added' or 'removed'
            yield {
              timestamp: isoTimestamp,
              type: 'monitor',
              action: monitorAction,
              person: person
            };
          }
          break;

        case 'ignored':
          {
            const ignoredAction = parts[2]; // 'set' or 'cleared'
            yield {
              timestamp: isoTimestamp,
              type: 'ignored',
              action: ignoredAction,
              person: person
            };
          }
          break;

        case 'taken':
          {
            const takenAction = parts[2]; // 'taken' or 'surrendered'
            yield {
              timestamp: isoTimestamp,
              type: 'taken',
              action: takenAction,
              person: person
            };
          }
          break;
      }
    }
  }

  /**
   * Initialize aggregate store (called by start())
   * @returns {Promise<void>}
   */
  async initializeAggregateStore() {
    return await this.aggregateModel.start();
  }

  /**
   * Register callback for when aggregates change (for SSE notifications)
   * @param {Function} callback - Called with (itemId) when aggregate changes
   */
  onAggregateChanged(callback) {
    return this.aggregateModel.onAggregateChanged(callback);
  }

  /**
   * Rebuild all aggregates from events
   * @param {Function} progressCallback - Optional callback(current, total)
   */
  async rebuildAllAggregates(progressCallback = null) {
    this._ensureInitialized();
    return await this.aggregateModel.rebuildAll(progressCallback);
  }

  /**
   * Validate all aggregates against events
   * @returns {Promise<Object>} Validation results
   */
  async validateAllAggregates() {
    this._ensureInitialized();
    return await this.aggregateModel.validateAllAggregates();
  }

  /**
   * Get configuration (merged with defaults and local config)
   * @param {Object} localConfig - Optional local configuration from client (localStorage)
   * @returns {Promise<Object>} Configuration object with defaults, project, and merged values
   */
  async getConfig(localConfig = null) {
    this._ensureInitialized();
    const defaults = configManager.getSystemDefaults();
    const project = await configManager.loadProjectConfig(this.baseDirectory);
    const merged = await configManager.getMergedConfig(this.baseDirectory, localConfig);

    return {
      defaults,
      project,
      merged
    };
  }

  /**
   * Save per-project configuration
   * @param {Object} config - Configuration object to save
   * @returns {Promise<void>}
   */
  async setProjectConfig(config) {
    this._ensureInitialized();
    await configManager.saveProjectConfig(this.baseDirectory, config);
  }
}
