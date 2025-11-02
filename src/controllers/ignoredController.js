/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Ignored Controller - handles ignore set/clear logic
 */

import { getItemDetails, createPersonData } from '../utils.js';
import { getItemFiles } from '../fileUtils.js';
import * as ignoredEvent from '../events/ignored.js';

/**
 * Mark an item as ignored
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function ignoreItem(baseDirectory, itemId, aggregateModel = null, gitOps = null) {
  // Verify item exists
  await getItemDetails(baseDirectory, itemId);

  // Check if already ignored
  const files = await getItemFiles(baseDirectory, itemId);
  const ignoredFiles = files.filter(f => f.filename.includes('.ignored.'));

  // Sort by timestamp to get latest
  if (ignoredFiles.length > 0) {
    const sorted = ignoredFiles.sort((a, b) => {
      const aTimestamp = a.filename.split('.')[3];
      const bTimestamp = b.filename.split('.')[3];
      return bTimestamp.localeCompare(aTimestamp);
    });

    const latest = sorted[0];
    const action = latest.filename.split('.')[2];

    if (action === 'set') {
      return; // Already ignored, idempotent
    }
  }

  const person = await createPersonData();

  // Create ignore file using event handler
  const filename = await ignoredEvent.createSetFile(baseDirectory, itemId, person);

  // Update aggregate if model provided
  if (aggregateModel) {
    const eventData = { person };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}

/**
 * Remove ignore flag from an item
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function unignoreItem(baseDirectory, itemId, aggregateModel = null, gitOps = null) {
  // Verify item exists
  await getItemDetails(baseDirectory, itemId);

  // Check if currently ignored
  const files = await getItemFiles(baseDirectory, itemId);
  const ignoredFiles = files.filter(f => f.filename.includes('.ignored.'));

  // If no ignore files or already cleared, do nothing
  if (ignoredFiles.length > 0) {
    const sorted = ignoredFiles.sort((a, b) => {
      const aTimestamp = a.filename.split('.')[3];
      const bTimestamp = b.filename.split('.')[3];
      return bTimestamp.localeCompare(aTimestamp);
    });

    const latest = sorted[0];
    const action = latest.filename.split('.')[2];

    if (action === 'cleared') {
      return; // Already not ignored, idempotent
    }
  } else {
    return; // Never ignored, idempotent
  }

  const person = await createPersonData();

  // Create cleared file using event handler
  const filename = await ignoredEvent.createClearFile(baseDirectory, itemId, person);

  // Update aggregate if model provided
  if (aggregateModel) {
    const eventData = { person };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}
