/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status Controller - handles status update logic
 */

import { getItemDetails, getAllItemFiles, createPersonData, validateStatus, getAllowedStatuses } from '../utils.js';
import { buildAllActiveDependencies } from '../stateBuilder.js';
import * as statusEvent from '../events/status.js';
import * as statusConfigEvent from '../events/statusConfiguration.js';
import { rebuildStatusesAggregate } from '../statusesAggregate.js';

/**
 * Update the status of an item
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @param {string} status - New status
 * @param {string} [text=''] - Optional text explanation
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function updateStatus(baseDirectory, itemId, status, text = '', aggregateModel = null, gitOps = null) {
  // Verify item exists
  const details = await getItemDetails(baseDirectory, itemId);

  // Validate status against statuses.json if it exists
  await validateStatus(baseDirectory, status);

  // If changing to completed, verify all dependencies are met
  if (status === 'completed' && details.dependencies.length > 0) {
    const allItemFiles = await getAllItemFiles(baseDirectory);
    const activeDeps = buildAllActiveDependencies(allItemFiles);

    const deps = activeDeps.get(itemId) || new Set();

    for (const depId of deps) {
      const depDetails = await getItemDetails(baseDirectory, depId);
      if (depDetails.status !== 'completed') {
        throw new Error(`Cannot complete item ${itemId}: dependency ${depId} is not completed`);
      }
    }
  }

  const person = await createPersonData();

  // Create status file using event handler
  const filename = await statusEvent.createFile(baseDirectory, itemId, status, text, person);

  // Update aggregate if model provided
  if (aggregateModel) {
    const eventData = { status, text, person };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}

/**
 * Update the allowed statuses configuration
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {Array<string>} statuses - Array of all status names (frontend sends full list)
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 * @returns {Promise<Array<string>>} The new complete list of statuses (including 'incomplete' and 'completed')
 */
export async function updateStatusConfiguration(baseDirectory, statuses, gitOps = null) {
  // Validate statuses
  if (!Array.isArray(statuses)) {
    throw new Error('Statuses must be an array');
  }

  // Filter out reserved statuses and validate
  const customStatuses = statuses.filter(s =>
    s !== 'incomplete' && s !== 'completed'
  );

  // Validate each status
  for (const status of customStatuses) {
    if (typeof status !== 'string' || status.trim().length === 0) {
      throw new Error('All statuses must be non-empty strings');
    }
  }

  // Remove duplicates from new statuses
  const newSet = new Set(customStatuses);

  // Get current statuses (without incomplete/completed)
  const currentStatuses = await getAllowedStatuses(baseDirectory);
  const currentSet = new Set(
    currentStatuses.filter(s => s !== 'incomplete' && s !== 'completed')
  );

  // Calculate diff
  const add = [...newSet].filter(s => !currentSet.has(s));
  const remove = [...currentSet].filter(s => !newSet.has(s));

  // Only create event if there are changes
  if (add.length === 0 && remove.length === 0) {
    // No changes, return current statuses
    return currentStatuses;
  }

  const person = await createPersonData();

  // Create event file with add/remove
  const filename = await statusConfigEvent.createFile(baseDirectory, { add, remove }, person);

  // Rebuild aggregate synchronously
  await rebuildStatusesAggregate(baseDirectory);

  // Get new statuses (with incomplete/completed) for return
  const newStatuses = await getAllowedStatuses(baseDirectory);

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }

  return newStatuses;
}
