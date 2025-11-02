/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Aggregate Model - Manages derived data store for Sparkle
 *
 * Maintains materialized views of current item state in .aggregates/items/
 * These are derived from event files and kept synchronized.
 */

import { join } from 'path';
import { readdir, readFile, stat, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { ensureDir, readJsonFile, writeJsonFile, readMatchingFiles, fileExists } from './fileUtils.js';
import { getAllItemFiles, createPersonData } from './utils.js';
import { buildItemState } from './stateBuilder.js';
import { generateItemId } from './nameUtils.js';
import * as itemEvent from './events/item.js';
import * as taglineEvent from './events/tagline.js';
import * as entryEvent from './events/entry.js';
import * as statusEvent from './events/status.js';
import * as dependencyEvent from './events/dependency.js';
import * as monitorEvent from './events/monitor.js';
import * as ignoredEvent from './events/ignored.js';
import * as takenEvent from './events/taken.js';

/**
 * AggregateModel class - manages aggregate store for a specific directory
 */
export class AggregateModel {
  /**
   * Create an AggregateModel instance
   * @param {string} baseDirectory - Base directory for sparkle data
   */
  constructor(baseDirectory) {
    this.baseDirectory = baseDirectory;
    this.aggregateDir = null;
    this.aggregateItemsDir = null;
    this.aggregateMetadataPath = null;
    this.eventFilesCachePath = null;

    // Rebuild state tracking
    this.rebuildInProgress = false;
    this.rebuildProgress = { current: 0, total: 0 };

    // Callback for when aggregates change (for SSE notifications)
    this.changeNotificationCallback = null;

    // Metrics tracking for incremental vs full rebuilds
    this.metrics = {
      incrementalUpdates: 0,
      fullRebuilds: 0,
      totalFilesReadIncremental: 0,
      totalFilesReadRebuild: 0,
      totalDurationIncremental: 0,
      totalDurationRebuild: 0
    };

    this.initialized = false;
  }

  /**
   * Initialize the aggregate store
   * Creates necessary directories and metadata file if they don't exist
   * @returns {Promise<void>}
   */
  async start() {
    this.aggregateDir = join(this.baseDirectory, '.aggregates');
    this.aggregateItemsDir = join(this.aggregateDir, 'items');
    this.aggregateMetadataPath = join(this.aggregateDir, 'metadata.json');
    this.eventFilesCachePath = join(this.aggregateDir, 'event-files.json');
    this.configPath = join(this.aggregateDir, 'config.json');

    // Create directories if they don't exist
    await ensureDir(this.aggregateDir);
    await ensureDir(this.aggregateItemsDir);

    // Initialize metadata if it doesn't exist
    if (!existsSync(this.aggregateMetadataPath)) {
      await writeJsonFile(this.aggregateMetadataPath, {
        version: 1,
        lastRebuildSHA: null,
        lastRebuildTimestamp: null,
        totalItems: 0
      });
    }

    // Initialize config.json if it doesn't exist
    if (!existsSync(this.configPath)) {
      await writeJsonFile(this.configPath, {
        darkMode: null,
        filters: {
          pending: null,
          monitor: null,
          ignored: null,
          taken: null
        }
      });
    }

    this.initialized = true;
    console.log('Aggregate store initialized:', this.aggregateItemsDir);
  }

  /**
   * Ensure initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('AggregateModel not initialized. Call start() first.');
    }
  }

  /**
   * Get the path to an aggregate file
   * @param {string} itemId - Item ID
   * @returns {string} Full path to aggregate file
   * @private
   */
  _getAggregatePath(itemId) {
    this._ensureInitialized();
    return join(this.aggregateItemsDir, `${itemId}.json`);
  }

  /**
   * Register callback for when aggregates change
   * @param {Function} callback - Called with (itemId) when aggregate changes
   */
  onAggregateChanged(callback) {
    this.changeNotificationCallback = callback;
  }

  /**
   * Notify that an aggregate has changed
   * @param {string} itemId - Item that changed
   * @private
   */
  _notifyAggregateChanged(itemId) {
    if (this.changeNotificationCallback) {
      this.changeNotificationCallback(itemId);
    }
  }

  /**
   * Build the event files cache - reads all event files from baseDirectory,
   * sorts them by timestamp, and writes to cache file
   * @returns {Promise<Array<string>>} Array of sorted event filenames
   * @private
   */
  async _buildEventFilesCache() {
    this._ensureInitialized();

    const startTime = Date.now();
    console.log('[AggregateModel] Building event files cache...');

    // Read all event files
    const allFiles = await readMatchingFiles(this.baseDirectory, '');

    // Filter to only event files (exclude system files like statuses.json)
    const eventFiles = allFiles.filter(filename => {
      if (filename === 'statuses.json') return false;

      const firstPart = filename.split('.')[0];
      // Event files start with 8-digit item IDs
      return /^\d{8}$/.test(firstPart);
    });

    // Parse timestamps and sort
    const filesWithTimestamps = eventFiles.map(filename => {
      const parts = filename.split('.');
      let timestamp = '0';

      // Extract timestamp based on file type
      if (parts.length === 2 && parts[1] === 'json') {
        // Creation file: itemId.json - use timestamp 0
        timestamp = '0';
      } else if (parts[1] === 'dependency') {
        // Dependency: itemId.dependency.action.target.timestamp.random.json
        timestamp = parts[4] || '0';
      } else if (parts[1] === 'monitor') {
        // Monitor: itemId.monitor.action.hash.timestamp.random.json
        timestamp = parts[4] || '0';
      } else if (parts[1] === 'taken') {
        // Taken: itemId.taken.action.hash.timestamp.random.json
        timestamp = parts[4] || '0';
      } else if (parts[1] === 'ignored') {
        // Ignored: itemId.ignored.action.timestamp.random.json
        timestamp = parts[3] || '0';
      } else {
        // Standard files: itemId.type.timestamp.random.json
        timestamp = parts[2] || '0';
      }

      return { filename, timestamp };
    });

    // Sort by timestamp
    filesWithTimestamps.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Extract just the filenames in sorted order
    const sortedFilenames = filesWithTimestamps.map(f => f.filename);

    // Write to cache
    await writeJsonFile(this.eventFilesCachePath, sortedFilenames);

    const duration = Date.now() - startTime;
    console.log(`[AggregateModel] Event files cache built: ${sortedFilenames.length} files (${duration}ms)`);

    return sortedFilenames;
  }

  /**
   * Get sorted event files, using cache if available
   * @param {Function} filterFn - Optional filter function (filename => boolean)
   * @returns {Promise<Array<string>>} Array of event filenames (sorted by timestamp)
   */
  async getEventFiles(filterFn = null) {
    this._ensureInitialized();

    // Check if cache exists
    let eventFiles;
    if (existsSync(this.eventFilesCachePath)) {
      // Use cached list
      eventFiles = await readJsonFile(this.eventFilesCachePath);
    } else {
      // Build cache
      eventFiles = await this._buildEventFilesCache();
    }

    // Apply filter if provided
    if (filterFn) {
      return eventFiles.filter(filterFn);
    }

    return eventFiles;
  }

  /**
   * Invalidate aggregate for a specific itemId (delete the aggregate file)
   * Called when git pull brings changes affecting this item
   * @param {string} itemId - Item ID to invalidate
   */
  async invalidateAggregate(itemId) {
    this._ensureInitialized();

    const aggregatePath = this._getAggregatePath(itemId);
    if (existsSync(aggregatePath)) {
      await unlink(aggregatePath);
      console.log(`[AggregateModel] Invalidated aggregate for item ${itemId}`);
    }

    // Also invalidate event files cache so it gets rebuilt
    await this.invalidateEventFilesCache();
  }

  /**
   * Invalidate aggregates for files that were pulled from remote
   * Extracts itemIds from filenames and invalidates affected aggregates
   * @param {Array<string>} filenames - Array of event filenames that were pulled
   */
  async invalidateAggregatesForFiles(filenames) {
    this._ensureInitialized();

    const itemIds = new Set();

    // Extract all affected itemIds from filenames
    for (const filename of filenames) {
      const ids = this._extractItemIdsFromFilename(filename);
      ids.forEach(id => itemIds.add(id));
    }

    if (itemIds.size === 0) {
      return;
    }

    console.log(`[AggregateModel] Invalidating ${itemIds.size} aggregates from ${filenames.length} pulled files`);

    // Invalidate each affected aggregate
    for (const itemId of itemIds) {
      const aggregatePath = this._getAggregatePath(itemId);
      if (existsSync(aggregatePath)) {
        await unlink(aggregatePath);
      }
    }

    // Invalidate event files cache once for all changes
    await this.invalidateEventFilesCache();
  }

  /**
   * Invalidate the event files cache (called after git pull brings new files)
   */
  async invalidateEventFilesCache() {
    this._ensureInitialized();

    if (existsSync(this.eventFilesCachePath)) {
      await unlink(this.eventFilesCachePath);
      console.log('[AggregateModel] Event files cache invalidated');
    }
  }

  /**
   * Add a new event file to the cache (called when we create a new file)
   * @param {string} filename - Event filename to add
   */
  async addEventFileToCache(filename) {
    this._ensureInitialized();

    // If cache doesn't exist, nothing to do (it will be built on next read)
    if (!existsSync(this.eventFilesCachePath)) {
      return;
    }

    try {
      const eventFiles = await readJsonFile(this.eventFilesCachePath);

      // Parse timestamp from filename
      const parts = filename.split('.');
      let timestamp = '0';

      if (parts.length === 2 && parts[1] === 'json') {
        timestamp = '0';
      } else if (parts[1] === 'dependency') {
        timestamp = parts[4] || '0';
      } else if (parts[1] === 'monitor') {
        timestamp = parts[4] || '0';
      } else if (parts[1] === 'taken') {
        timestamp = parts[4] || '0';
      } else if (parts[1] === 'ignored') {
        timestamp = parts[3] || '0';
      } else {
        timestamp = parts[2] || '0';
      }

      // Find insertion point to maintain sort order
      let insertIndex = eventFiles.length;
      for (let i = eventFiles.length - 1; i >= 0; i--) {
        const existingParts = eventFiles[i].split('.');
        let existingTimestamp = '0';

        if (existingParts.length === 2 && existingParts[1] === 'json') {
          existingTimestamp = '0';
        } else if (existingParts[1] === 'dependency') {
          existingTimestamp = existingParts[4] || '0';
        } else if (existingParts[1] === 'monitor') {
          existingTimestamp = existingParts[4] || '0';
        } else if (existingParts[1] === 'taken') {
          existingTimestamp = existingParts[4] || '0';
        } else if (existingParts[1] === 'ignored') {
          existingTimestamp = existingParts[3] || '0';
        } else {
          existingTimestamp = existingParts[2] || '0';
        }

        if (timestamp.localeCompare(existingTimestamp) >= 0) {
          insertIndex = i + 1;
          break;
        }
      }

      // Insert at the correct position
      eventFiles.splice(insertIndex, 0, filename);

      // Write updated cache
      await writeJsonFile(this.eventFilesCachePath, eventFiles);

    } catch (error) {
      // If there's any error updating cache, just invalidate it
      console.error('[AggregateModel] Error updating cache, invalidating:', error.message);
      await this.invalidateEventFilesCache();
    }
  }

  /**
   * Get a single aggregate
   * @param {string} itemId - Item ID
   * @returns {Promise<Object|null>} Aggregate data or null if not found
   */
  async getAggregate(itemId) {
    this._ensureInitialized();

    const startTime = Date.now();
    const aggregatePath = this._getAggregatePath(itemId);

    if (!existsSync(aggregatePath)) {
      return null;
    }

    try {
      const aggregate = await readJsonFile(aggregatePath);
      const duration = Date.now() - startTime;
      console.log(`[Aggregate] getAggregate(${itemId}) - ${duration}ms`);
      return aggregate;
    } catch (error) {
      console.error(`Error reading aggregate ${itemId}:`, error);
      return null;
    }
  }

  /**
   * Get all aggregates
   * @returns {Promise<Array>} Array of all aggregates
   */
  async getAllAggregates() {
    this._ensureInitialized();

    const startTime = Date.now();
    const readdirStartTime = Date.now();
    const files = await readdir(this.aggregateItemsDir);
    const readdirDuration = Date.now() - readdirStartTime;

    const jsonFiles = files.filter(f => f.endsWith('.json'));
    console.log(`[Aggregate] getAllAggregates() - readdir: ${readdirDuration}ms, reading ${jsonFiles.length} files...`);

    const readFilesStartTime = Date.now();
    const aggregates = [];

    for (const file of jsonFiles) {
      const filePath = join(this.aggregateItemsDir, file);
      try {
        const aggregate = await readJsonFile(filePath);
        aggregates.push(aggregate);
      } catch (error) {
        console.error(`Error reading aggregate file ${file}:`, error);
      }
    }

    const readFilesDuration = Date.now() - readFilesStartTime;
    const totalDuration = Date.now() - startTime;

    console.log(`[Aggregate] getAllAggregates() - readdir: ${readdirDuration}ms, readAllFiles: ${readFilesDuration}ms, total: ${totalDuration}ms, count: ${aggregates.length}`);

    return aggregates;
  }

  /**
   * Validate an aggregate against its events
   * @param {string} itemId - Item ID to validate
   * @returns {Promise<Object>} Validation result {valid: boolean, differences: Array}
   */
  async validateAggregate(itemId) {
    this._ensureInitialized();

    const aggregate = await this.getAggregate(itemId);
    if (!aggregate) {
      return { valid: false, differences: ['Aggregate does not exist'] };
    }

    // Get event files and rebuild state
    const allItemFiles = await getAllItemFiles(this.baseDirectory);
    const itemFiles = allItemFiles.get(itemId);

    if (!itemFiles || itemFiles.length === 0) {
      return { valid: false, differences: ['No event files found for item'] };
    }

    const rebuiltState = buildItemState(itemFiles);

    if (!rebuiltState) {
      return { valid: false, differences: ['Could not rebuild state from events'] };
    }

    // Compare aggregate with rebuilt state
    const differences = [];

    // Compare key fields
    const fieldsToCompare = ['itemId', 'tagline', 'status', 'createdTimestamp', 'ignored'];

    for (const field of fieldsToCompare) {
      if (JSON.stringify(aggregate[field]) !== JSON.stringify(rebuiltState[field])) {
        differences.push(`${field}: aggregate=${JSON.stringify(aggregate[field])}, rebuilt=${JSON.stringify(rebuiltState[field])}`);
      }
    }

    // Compare arrays/sets
    const aggregateDeps = new Set(aggregate.dependencies || []);
    const rebuiltDeps = new Set(rebuiltState.dependencies || []);

    if (aggregateDeps.size !== rebuiltDeps.size || ![...aggregateDeps].every(d => rebuiltDeps.has(d))) {
      differences.push(`dependencies: aggregate=${[...aggregateDeps].sort()}, rebuilt=${[...rebuiltDeps].sort()}`);
    }

    return {
      valid: differences.length === 0,
      differences
    };
  }

  /**
   * Validate all aggregates
   * @returns {Promise<Object>} Validation results {valid: number, invalid: Array}
   */
  async validateAllAggregates() {
    this._ensureInitialized();

    const aggregates = await this.getAllAggregates();
    const invalid = [];

    for (const aggregate of aggregates) {
      const validation = await this.validateAggregate(aggregate.itemId);
      if (!validation.valid) {
        invalid.push({
          itemId: aggregate.itemId,
          differences: validation.differences
        });
      }
    }

    return {
      valid: aggregates.length - invalid.length,
      invalid
    };
  }

  /**
   * Rebuild a single aggregate from its events
   * @param {string} itemId - Item ID to rebuild
   * @returns {Promise<Object|null>} The rebuilt aggregate, or null if item doesn't exist
   */
  async rebuildAggregate(itemId) {
    this._ensureInitialized();

    const startTime = Date.now();

    // Get all event files from disk (not cache) mentioning this itemId
    // Match: itemId at start OR .itemId. anywhere in filename
    const allFiles = await readMatchingFiles(this.baseDirectory, '');
    const relevantFilenames = allFiles.filter(filename =>
      filename.startsWith(`${itemId}.`) || filename.includes(`.${itemId}.`)
    );

    const filesRead = relevantFilenames.length;

    if (relevantFilenames.length === 0) {
      // Item doesn't exist, remove aggregate if it exists
      const aggregatePath = this._getAggregatePath(itemId);
      if (existsSync(aggregatePath)) {
        await unlink(aggregatePath);
        console.log(`Removed aggregate for deleted item: ${itemId}`);
      }
      return null;
    }

    // Load file data for all relevant files
    const itemFiles = [];
    for (const filename of relevantFilenames) {
      const filePath = join(this.baseDirectory, filename);
      try {
        const data = await readJsonFile(filePath);
        itemFiles.push({ filename, data });
      } catch (error) {
        console.error(`Error reading file ${filename}:`, error.message);
      }
    }

    // Build state from events
    const state = buildItemState(itemFiles, itemId);

    if (!state) {
      console.error(`Could not build state for item ${itemId}`);
      return null;
    }

    // Write aggregate
    const aggregatePath = this._getAggregatePath(itemId);
    await writeJsonFile(aggregatePath, state);

    const duration = Date.now() - startTime;
    this.metrics.fullRebuilds++;
    this.metrics.totalFilesReadRebuild += filesRead;
    this.metrics.totalDurationRebuild += duration;

    console.log(`[Aggregate] rebuildAggregate(${itemId}) - type: full_rebuild, filesRead: ${filesRead}, eventsProcessed: ${filesRead}, duration: ${duration}ms`);

    // Notify listeners
    this._notifyAggregateChanged(itemId);

    return state;
  }

  /**
   * Rebuild all aggregates from events
   * @param {Function} progressCallback - Optional callback(current, total)
   * @returns {Promise<void>}
   */
  async rebuildAll(progressCallback = null) {
    this._ensureInitialized();

    if (this.rebuildInProgress) {
      throw new Error('Rebuild already in progress');
    }

    this.rebuildInProgress = true;

    try {
      // Get all item files
      const allItemFiles = await getAllItemFiles(this.baseDirectory);
      const itemIds = Array.from(allItemFiles.keys());

      this.rebuildProgress = {
        current: 0,
        total: itemIds.length
      };

      console.log(`Rebuilding ${itemIds.length} aggregates...`);

      // Rebuild each item
      for (const itemId of itemIds) {
        await this.rebuildAggregate(itemId);

        this.rebuildProgress.current++;

        if (progressCallback) {
          progressCallback(this.rebuildProgress.current, this.rebuildProgress.total);
        }

        // Log progress every 100 items
        if (this.rebuildProgress.current % 100 === 0) {
          console.log(`Rebuilt ${this.rebuildProgress.current}/${this.rebuildProgress.total} aggregates`);
        }
      }

      // Update metadata
      await this.updateMetadata({
        lastRebuildTimestamp: new Date().toISOString(),
        totalItems: itemIds.length
      });

      console.log(`Rebuilt all ${itemIds.length} aggregates`);
    } finally {
      this.rebuildInProgress = false;
      this.rebuildProgress = { current: 0, total: 0 };
    }
  }

  /**
   * Invalidate an aggregate (mark for rebuild)
   * Currently just rebuilds it immediately
   * @param {string} itemId - Item ID
   * @returns {Promise<void>}
   */
  async invalidateAggregate(itemId) {
    this._ensureInitialized();
    await this.rebuildAggregate(itemId);
  }

  /**
   * Get aggregate rebuild status
   * @returns {Object} Status {inProgress: boolean, current: number, total: number}
   */
  getAggregateStatus() {
    return {
      inProgress: this.rebuildInProgress,
      current: this.rebuildProgress.current,
      total: this.rebuildProgress.total
    };
  }

  /**
   * Get metadata
   * @returns {Promise<Object>} Metadata object
   */
  async getMetadata() {
    this._ensureInitialized();

    if (!existsSync(this.aggregateMetadataPath)) {
      return null;
    }

    return await readJsonFile(this.aggregateMetadataPath);
  }

  /**
   * Update metadata
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updateMetadata(updates) {
    this._ensureInitialized();

    const metadata = await this.getMetadata() || {};
    Object.assign(metadata, updates);
    await writeJsonFile(this.aggregateMetadataPath, metadata);
  }

  /**
   * Update aggregates affected by an event
   * Called after an event file is written (by controller) or pulled (by git)
   * @param {string} eventFilename - Name of the event file (e.g., "12345678.entry.20250101.abc.json")
   * @param {Object} eventData - Optional event data (if provided, skips file reading for performance)
   * @returns {Promise<void>}
   */
  async updateAggregateForEvent(eventFilename, eventData = null) {
    this._ensureInitialized();

    // Extract all itemIds affected by this event
    const affectedItemIds = this._extractItemIdsFromFilename(eventFilename);

    if (affectedItemIds.length === 0) {
      // Not an event file we care about
      return;
    }

    // Update aggregate for each affected itemId
    for (const itemId of affectedItemIds) {
      await this._updateAggregateIncremental(itemId, eventFilename, eventData);
    }
  }

  /**
   * Incrementally update an aggregate based on a new event
   * @param {string} itemId - Item ID to update
   * @param {string} eventFilename - Event filename
   * @param {Object} eventData - Event data (optional, if null will read file)
   * @returns {Promise<Object|null>} The updated aggregate, or null if it doesn't exist
   * @private
   */
  async _updateAggregateIncremental(itemId, eventFilename, eventData) {
    const startTime = Date.now();
    const operation = this._extractOperation(eventFilename);
    let filesRead = 0;

    try {
      // If no eventData provided, must do full rebuild
      if (!eventData) {
        console.log(`[Aggregate] updateAggregate(${itemId}) - operation: ${operation}, type: full_rebuild, reason: no_event_data`);
        return await this._fullRebuild(itemId, startTime, operation);
      }

      // Read existing aggregate
      const aggregatePath = this._getAggregatePath(itemId);
      if (!existsSync(aggregatePath)) {
        // No aggregate exists, full rebuild (likely item creation)
        console.log(`[Aggregate] updateAggregate(${itemId}) - operation: ${operation}, type: full_rebuild, reason: no_aggregate`);
        return await this._fullRebuild(itemId, startTime, operation);
      }

      const aggregate = await readJsonFile(aggregatePath);
      filesRead++;

      // Parse event type and apply incremental update
      const eventType = this._parseEventType(eventFilename);
      const updated = await this._applyIncrementalUpdate(
        aggregate,
        eventType,
        eventFilename,
        eventData
      );

      // Write updated aggregate
      await writeJsonFile(aggregatePath, updated);

      const duration = Date.now() - startTime;
      this.metrics.incrementalUpdates++;
      this.metrics.totalFilesReadIncremental += filesRead;
      this.metrics.totalDurationIncremental += duration;

      console.log(`[Aggregate] updateAggregate(${itemId}) - operation: ${operation}, type: incremental, filesRead: ${filesRead}, duration: ${duration}ms`);

      // Notify listeners
      this._notifyAggregateChanged(itemId);

      return updated;

    } catch (error) {
      console.error(`[Aggregate] Incremental update failed for ${itemId}, falling back to rebuild:`, error.message);
      return await this._fullRebuild(itemId, startTime, operation);
    }
  }

  /**
   * Perform a full rebuild and track metrics
   * @returns {Promise<Object|null>} The rebuilt aggregate, or null if it doesn't exist
   * @private
   */
  async _fullRebuild(itemId, startTime, operation) {
    const rebuildStart = Date.now();

    // Get all event files from disk mentioning this itemId
    const allFiles = await readMatchingFiles(this.baseDirectory, '');
    const relevantFilenames = allFiles.filter(filename =>
      filename.startsWith(`${itemId}.`) || filename.includes(`.${itemId}.`)
    );

    const filesRead = relevantFilenames.length;

    if (relevantFilenames.length === 0) {
      const aggregatePath = this._getAggregatePath(itemId);
      if (existsSync(aggregatePath)) {
        await unlink(aggregatePath);
      }
      return null;
    }

    // Load file data for all relevant files
    const itemFiles = [];
    for (const filename of relevantFilenames) {
      const filePath = join(this.baseDirectory, filename);
      try {
        const data = await readJsonFile(filePath);
        itemFiles.push({ filename, data });
      } catch (error) {
        console.error(`Error reading file ${filename}:`, error.message);
      }
    }

    // Build state from events
    const state = buildItemState(itemFiles, itemId);

    if (!state) {
      console.error(`Could not build state for item ${itemId}`);
      return null;
    }

    // Write aggregate
    const aggregatePath = this._getAggregatePath(itemId);
    await writeJsonFile(aggregatePath, state);

    const duration = Date.now() - startTime;
    this.metrics.fullRebuilds++;
    this.metrics.totalFilesReadRebuild += filesRead;
    this.metrics.totalDurationRebuild += duration;

    console.log(`[Aggregate] updateAggregate(${itemId}) - operation: ${operation}, type: full_rebuild, filesRead: ${filesRead}, eventsProcessed: ${filesRead}, duration: ${duration}ms`);

    // Notify listeners
    this._notifyAggregateChanged(itemId);

    return state;
  }

  /**
   * Parse event type from filename
   * @private
   */
  _parseEventType(filename) {
    const parts = filename.split('.');

    if (parts.length === 2 && parts[1] === 'json') {
      return 'item_creation';
    }

    return parts[1]; // entry, tagline, status, dependency, monitor, ignored, taken
  }

  /**
   * Extract operation name from filename for logging
   * @private
   */
  _extractOperation(filename) {
    const parts = filename.split('.');

    if (parts.length === 2 && parts[1] === 'json') {
      return 'createItem';
    }

    const type = parts[1];
    const action = parts[2];

    if (type === 'dependency') {
      return action === 'linked' ? 'addDependency' : 'removeDependency';
    } else if (type === 'monitor') {
      return action === 'added' ? 'addMonitor' : 'removeMonitor';
    } else if (type === 'ignored') {
      return action === 'set' ? 'ignoreItem' : 'unignoreItem';
    } else if (type === 'taken') {
      return action === 'taken' ? 'takeItem' : 'surrenderItem';
    } else if (type === 'entry') {
      return 'addEntry';
    } else if (type === 'tagline') {
      return 'alterTagline';
    } else if (type === 'status') {
      return 'updateStatus';
    }

    return type;
  }

  /**
   * Apply an incremental update to an aggregate
   * @private
   */
  async _applyIncrementalUpdate(aggregate, eventType, eventFilename, eventData) {
    const parts = eventFilename.split('.');
    const action = parts[2];

    switch (eventType) {
      case 'entry':
        // Add entry to entries array
        const timestamp = parts[2]; // itemId.entry.timestamp.random.json
        aggregate.entries = aggregate.entries || [];
        aggregate.entries.push({
          text: eventData.text,
          createdTimestamp: timestamp,
          person: eventData.person
        });
        break;

      case 'tagline':
        // Update tagline
        aggregate.tagline = eventData.tagline;
        break;

      case 'status':
        // Update status
        aggregate.status = eventData.status;
        break;

      case 'dependency':
        // Update dependencies or dependents depending on which item this is
        // filename: itemNeeding.dependency.action.itemNeeded.timestamp.random.json
        const targetItemId = parts[3];
        const sourceItemId = parts[0];

        // Check if this aggregate is the one doing the depending or being depended on
        if (aggregate.itemId === sourceItemId) {
          // This is the item that needs (itemNeeding) - update dependencies
          aggregate.dependencies = aggregate.dependencies || [];
          if (action === 'linked') {
            if (!aggregate.dependencies.includes(targetItemId)) {
              aggregate.dependencies.push(targetItemId);
            }
          } else if (action === 'unlinked') {
            aggregate.dependencies = aggregate.dependencies.filter(id => id !== targetItemId);
          }
        } else {
          // This is the item being needed (itemNeeded) - update dependents
          aggregate.dependents = aggregate.dependents || [];
          if (action === 'linked') {
            if (!aggregate.dependents.includes(sourceItemId)) {
              aggregate.dependents.push(sourceItemId);
            }
          } else if (action === 'unlinked') {
            aggregate.dependents = aggregate.dependents.filter(id => id !== sourceItemId);
          }
        }
        break;

      case 'monitor':
        // Update monitors
        const hash = eventData.hash;
        aggregate.monitors = aggregate.monitors || [];

        if (action === 'added') {
          if (!aggregate.monitors.find(m => m.hash === hash)) {
            aggregate.monitors.push({ hash, ...eventData.person });
          }
        } else if (action === 'removed') {
          aggregate.monitors = aggregate.monitors.filter(m => m.hash !== hash);
        }
        break;

      case 'ignored':
        // Update ignored flag
        aggregate.ignored = (action === 'set');
        break;

      case 'taken':
        // Update takenBy
        if (action === 'taken') {
          aggregate.takenBy = eventData.person;
        } else if (action === 'surrendered') {
          aggregate.takenBy = null;
        }
        break;

      default:
        throw new Error(`Unknown event type: ${eventType}`);
    }

    return aggregate;
  }

  /**
   * Extract all itemIds from an event filename
   * @param {string} filename - Event filename
   * @returns {Array<string>} Array of itemIds found in filename
   * @private
   */
  _extractItemIdsFromFilename(filename) {
    const itemIds = new Set();
    const parts = filename.split('.');

    // First part is always an itemId if it's an 8-digit number
    const firstPart = parts[0];
    if (/^\d{8}$/.test(firstPart)) {
      itemIds.add(firstPart);
    }

    // For dependency files: itemId.dependency.action.targetItemId.timestamp.random.json
    // The targetItemId is in position 3
    if (parts[1] === 'dependency' && parts.length >= 4) {
      const targetItemId = parts[3];
      if (/^\d{8}$/.test(targetItemId)) {
        itemIds.add(targetItemId);
      }
    }

    return Array.from(itemIds);
  }

  /**
   * Get metrics for incremental vs full rebuild performance
   * @returns {Object} Metrics object with counts and averages
   */
  getMetrics() {
    const avgFilesIncremental = this.metrics.incrementalUpdates > 0
      ? this.metrics.totalFilesReadIncremental / this.metrics.incrementalUpdates
      : 0;

    const avgFilesRebuild = this.metrics.fullRebuilds > 0
      ? this.metrics.totalFilesReadRebuild / this.metrics.fullRebuilds
      : 0;

    const avgDurationIncremental = this.metrics.incrementalUpdates > 0
      ? this.metrics.totalDurationIncremental / this.metrics.incrementalUpdates
      : 0;

    const avgDurationRebuild = this.metrics.fullRebuilds > 0
      ? this.metrics.totalDurationRebuild / this.metrics.fullRebuilds
      : 0;

    const totalUpdates = this.metrics.incrementalUpdates + this.metrics.fullRebuilds;
    const incrementalPercentage = totalUpdates > 0
      ? (this.metrics.incrementalUpdates / totalUpdates * 100).toFixed(1)
      : 0;

    return {
      incrementalUpdates: this.metrics.incrementalUpdates,
      fullRebuilds: this.metrics.fullRebuilds,
      totalUpdates,
      incrementalPercentage: parseFloat(incrementalPercentage),
      avgFilesReadIncremental: parseFloat(avgFilesIncremental.toFixed(2)),
      avgFilesReadRebuild: parseFloat(avgFilesRebuild.toFixed(2)),
      avgDurationIncremental: parseFloat(avgDurationIncremental.toFixed(2)),
      avgDurationRebuild: parseFloat(avgDurationRebuild.toFixed(2)),
      speedupFactor: avgDurationRebuild > 0 && avgDurationIncremental > 0
        ? parseFloat((avgDurationRebuild / avgDurationIncremental).toFixed(2))
        : 0
    };
  }

  /**
   * Reset metrics counters
   */
  resetMetrics() {
    this.metrics = {
      incrementalUpdates: 0,
      fullRebuilds: 0,
      totalFilesReadIncremental: 0,
      totalFilesReadRebuild: 0,
      totalDurationIncremental: 0,
      totalDurationRebuild: 0
    };
  }

  /**
   * Print metrics summary to console
   */
  printMetrics() {
    const metrics = this.getMetrics();
    console.log('\n=== Aggregate Update Metrics ===');
    console.log(`Total Updates: ${metrics.totalUpdates}`);
    console.log(`  Incremental: ${metrics.incrementalUpdates} (${metrics.incrementalPercentage}%)`);
    console.log(`  Full Rebuilds: ${metrics.fullRebuilds} (${(100 - metrics.incrementalPercentage).toFixed(1)}%)`);
    console.log(`\nAverage Files Read:`);
    console.log(`  Incremental: ${metrics.avgFilesReadIncremental}`);
    console.log(`  Full Rebuild: ${metrics.avgFilesReadRebuild}`);
    console.log(`\nAverage Duration:`);
    console.log(`  Incremental: ${metrics.avgDurationIncremental}ms`);
    console.log(`  Full Rebuild: ${metrics.avgDurationRebuild}ms`);
    if (metrics.speedupFactor > 0) {
      console.log(`\nSpeedup Factor: ${metrics.speedupFactor}x faster`);
    }
    console.log('================================\n');
  }

  // Legacy aliases for backward compatibility
  async initializeAggregateStore() {
    return await this.start();
  }

  async rebuildAllAggregates(progressCallback = null) {
    return await this.rebuildAll(progressCallback);
  }

  async validateAllAggregates() {
    return await this.validateAllAggregates();
  }
}
