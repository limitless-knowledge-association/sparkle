/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Aggregate Manager - Manages derived data store for Sparkle
 *
 * Maintains materialized views of current item state in .aggregates/items/
 * These are derived from event files and kept synchronized.
 */

import { join } from 'path';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { ensureDir, readJsonFile, writeJsonFile } from './fileUtils.js';
import { getAllItemFiles } from './utils.js';
import { buildItemState } from './stateBuilder.js';

// Base directory for sparkle data (set by initializeAggregateStore)
let baseDirectory = null;

// Aggregate directory paths
let aggregateDir = null;
let aggregateItemsDir = null;
let aggregateMetadataPath = null;

// Rebuild state tracking
let rebuildInProgress = false;
let rebuildProgress = { current: 0, total: 0 };

// Callback for when aggregates change (for SSE notifications)
let changeNotificationCallback = null;

/**
 * Register a callback to be called when an aggregate is rebuilt
 * Used by the daemon to broadcast SSE events
 * @param {Function} callback - Function called with (itemId) when aggregate changes
 */
export function onAggregateChanged(callback) {
  changeNotificationCallback = callback;
}

/**
 * Notify daemon of aggregate update via HTTP (when no callback registered)
 * Used when external processes write event files
 * @param {string} itemId - Item that was updated
 */
async function notifyDaemonAsync(itemId) {
  const portFilePath = join(baseDirectory, 'last_port.data');

  if (!existsSync(portFilePath)) {
    return; // No daemon running
  }

  try {
    const portData = await readFile(portFilePath, 'utf8');
    const port = parseInt(portData.trim(), 10);

    if (isNaN(port)) {
      return;
    }

    // Fire-and-forget HTTP POST
    const http = await import('http');
    const postData = JSON.stringify({ itemId });

    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/internal/aggregateUpdated',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 1000 // Quick timeout
    }, (res) => {
      // Consume response but ignore
      res.resume();
    });

    req.on('error', () => {
      // Silent failure - daemon might not be running
    });

    req.write(postData);
    req.end();
  } catch (err) {
    // Silent failure
  }
}

/**
 * Initialize the aggregate store
 * Creates directory structure and validates environment
 * @param {string} baseDir - Base directory for sparkle data
 */
export async function initializeAggregateStore(baseDir) {
  baseDirectory = baseDir;
  aggregateDir = join(baseDirectory, '.aggregates');
  aggregateItemsDir = join(aggregateDir, 'items');
  aggregateMetadataPath = join(aggregateDir, 'metadata.json');

  // Create directories if they don't exist
  await ensureDir(aggregateDir);
  await ensureDir(aggregateItemsDir);

  // Initialize metadata if it doesn't exist
  if (!existsSync(aggregateMetadataPath)) {
    await writeJsonFile(aggregateMetadataPath, {
      version: 1,
      lastRebuildSHA: null,
      lastRebuildTimestamp: null,
      totalItems: 0
    });
  }

  console.log('Aggregate store initialized:', aggregateItemsDir);
}

/**
 * Get the path to an aggregate file
 * @param {string} itemId - Item ID
 * @returns {string} Full path to aggregate file
 */
function getAggregatePath(itemId) {
  if (!aggregateItemsDir) {
    throw new Error('Aggregate store not initialized. Call initializeAggregateStore() first.');
  }
  return join(aggregateItemsDir, `${itemId}.json`);
}

/**
 * Read an aggregate file
 * @param {string} itemId - Item ID
 * @returns {Promise<Object|null>} Aggregate object or null if not found
 */
export async function getAggregate(itemId) {
  const startTime = Date.now();
  const aggregatePath = getAggregatePath(itemId);

  if (!existsSync(aggregatePath)) {
    return null;
  }

  try {
    const aggregate = await readJsonFile(aggregatePath);
    const duration = Date.now() - startTime;
    console.log(`[Aggregate] getAggregate(${itemId}) - ${duration}ms`);
    return aggregate;
  } catch (error) {
    console.error(`Failed to read aggregate for ${itemId}:`, error.message);
    return null;
  }
}

/**
 * Get all aggregates
 * @returns {Promise<Array>} Array of all aggregate objects
 */
export async function getAllAggregates() {
  const startTime = Date.now();

  if (!aggregateItemsDir) {
    throw new Error('Aggregate store not initialized');
  }

  const readdirStartTime = Date.now();
  const files = await readdir(aggregateItemsDir);
  const readdirDuration = Date.now() - readdirStartTime;

  console.log(`[Aggregate] getAllAggregates() - readdir: ${readdirDuration}ms, reading ${files.filter(f => f.endsWith('.json')).length} files...`);

  const readFilesStartTime = Date.now();
  const aggregates = [];

  for (const filename of files) {
    if (!filename.endsWith('.json')) {
      continue;
    }

    const itemId = filename.replace('.json', '');
    if (!/^\d{8}$/.test(itemId)) {
      continue;
    }

    const aggregate = await getAggregate(itemId);
    if (aggregate) {
      aggregates.push(aggregate);
    }
  }

  const readFilesDuration = Date.now() - readFilesStartTime;
  const totalDuration = Date.now() - startTime;
  console.log(`[Aggregate] getAllAggregates() - readdir: ${readdirDuration}ms, readAllFiles: ${readFilesDuration}ms, total: ${totalDuration}ms, count: ${aggregates.length}`);

  return aggregates;
}

/**
 * Validate an aggregate file
 * @param {string} itemId - Item ID
 * @returns {Promise<{valid: boolean, errors: string[]}>} Validation result
 */
export async function validateAggregate(itemId) {
  const errors = [];
  const aggregate = await getAggregate(itemId);

  if (!aggregate) {
    return { valid: false, errors: ['Aggregate file not found'] };
  }

  // Check required fields
  const requiredFields = ['itemId', 'tagline', 'status', 'created'];
  for (const field of requiredFields) {
    if (!aggregate[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check itemId matches filename
  if (aggregate.itemId !== itemId) {
    errors.push(`ItemId mismatch: file=${itemId}, content=${aggregate.itemId}`);
  }

  // Check metadata exists
  if (!aggregate._meta) {
    errors.push('Missing _meta field');
  } else {
    // Validate event file count matches
    const eventFiles = await getAllItemFiles(baseDirectory);
    const itemFiles = eventFiles.get(itemId);
    if (itemFiles && itemFiles.length !== aggregate._meta.eventFileCount) {
      errors.push(`Event file count mismatch: expected=${itemFiles.length}, got=${aggregate._meta.eventFileCount}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate all aggregates
 * @returns {Promise<{valid: boolean, invalidItems: Array}>} Validation result
 */
export async function validateAllAggregates() {
  const allItemFiles = await getAllItemFiles(baseDirectory);
  const invalidItems = [];

  for (const [itemId] of allItemFiles.entries()) {
    const validation = await validateAggregate(itemId);
    if (!validation.valid) {
      invalidItems.push({ itemId, errors: validation.errors });
    }
  }

  return {
    valid: invalidItems.length === 0,
    invalidItems
  };
}

/**
 * Rebuild an aggregate from event files
 * @param {string} itemId - Item ID
 * @returns {Promise<void>}
 */
export async function rebuildAggregate(itemId) {
  // Get all event files for this item
  const allItemFiles = await getAllItemFiles(baseDirectory);
  const itemFiles = allItemFiles.get(itemId);

  if (!itemFiles || itemFiles.length === 0) {
    // Item doesn't exist, remove aggregate if it exists
    const aggregatePath = getAggregatePath(itemId);
    if (existsSync(aggregatePath)) {
      const { unlink } = await import('fs/promises');
      await unlink(aggregatePath);
      console.log(`Removed aggregate for deleted item: ${itemId}`);
    }
    return;
  }

  // Build current state from events
  const state = buildItemState(itemFiles);

  if (!state) {
    console.warn(`Failed to build state for item ${itemId}`);
    return;
  }

  // Calculate derived fields
  const dependencyCount = state.dependencies ? state.dependencies.length : 0;
  const entryCount = state.entries ? state.entries.length : 0;

  // Find latest event timestamp
  let lastEventTimestamp = state.created;
  for (const file of itemFiles) {
    if (file.data.person && file.data.person.timestamp) {
      if (file.data.person.timestamp > lastEventTimestamp) {
        lastEventTimestamp = file.data.person.timestamp;
      }
    }
  }

  // Create aggregate object
  const aggregate = {
    ...state,
    creator: state.person, // Rename person to creator for clarity

    // Derived fields
    dependencyCount,
    entryCount,

    // Metadata
    _meta: {
      lastEventTimestamp,
      eventFileCount: itemFiles.length,
      builtAt: new Date().toISOString(),
      builtFromSHA: null // Will be set by daemon if available
    }
  };

  // Write aggregate file
  const aggregatePath = getAggregatePath(itemId);
  await writeJsonFile(aggregatePath, aggregate);

  // Notify callback (for SSE broadcasting)
  if (changeNotificationCallback) {
    changeNotificationCallback(itemId);
  } else {
    // No callback registered - attempt to notify daemon via HTTP
    // This handles external sparkle.js usage
    notifyDaemonAsync(itemId).catch(() => {
      // Silent failure
    });
  }
}

/**
 * Rebuild all aggregates from event files
 * @param {Function} progressCallback - Optional callback(current, total) for progress updates
 * @returns {Promise<void>}
 */
export async function rebuildAll(progressCallback = null) {
  rebuildInProgress = true;

  try {
    const allItemFiles = await getAllItemFiles(baseDirectory);
    const total = allItemFiles.size;
    let current = 0;

    rebuildProgress = { current: 0, total };

    console.log(`Rebuilding ${total} aggregates...`);

    for (const [itemId] of allItemFiles.entries()) {
      await rebuildAggregate(itemId);
      current++;
      rebuildProgress = { current, total };

      if (progressCallback) {
        progressCallback(current, total);
      }

      // Log progress every 10 items
      if (current % 10 === 0 || current === total) {
        console.log(`Rebuild progress: ${current}/${total}`);
      }
    }

    // Update metadata
    const metadata = {
      version: 1,
      lastRebuildSHA: null, // Will be updated by daemon
      lastRebuildTimestamp: new Date().toISOString(),
      totalItems: total
    };
    await writeJsonFile(aggregateMetadataPath, metadata);

    console.log(`Rebuild complete: ${total} aggregates`);
  } finally {
    rebuildInProgress = false;
  }
}

/**
 * Invalidate an aggregate (mark for rebuild)
 * Currently just deletes the file, forcing rebuild on next access
 * @param {string} itemId - Item ID
 */
export async function invalidateAggregate(itemId) {
  const aggregatePath = getAggregatePath(itemId);

  if (existsSync(aggregatePath)) {
    const { unlink } = await import('fs/promises');
    await unlink(aggregatePath);
    console.log(`Invalidated aggregate: ${itemId}`);
  }
}

/**
 * Get current rebuild status
 * @returns {{rebuilding: boolean, progress: {current: number, total: number}}}
 */
export function getAggregateStatus() {
  return {
    rebuilding: rebuildInProgress,
    progress: rebuildProgress
  };
}

/**
 * Get metadata about the aggregate store
 * @returns {Promise<Object>} Metadata object
 */
export async function getMetadata() {
  if (!existsSync(aggregateMetadataPath)) {
    return null;
  }
  return await readJsonFile(aggregateMetadataPath);
}

/**
 * Update metadata (e.g., after git pull)
 * @param {Object} updates - Fields to update in metadata
 */
export async function updateMetadata(updates) {
  const current = await getMetadata() || {
    version: 1,
    lastRebuildSHA: null,
    lastRebuildTimestamp: null,
    totalItems: 0
  };

  const updated = { ...current, ...updates };
  await writeJsonFile(aggregateMetadataPath, updated);
}
