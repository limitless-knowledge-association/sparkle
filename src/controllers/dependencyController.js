/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Dependency Controller - handles dependency link/unlink logic
 */

import { getItemDetails, getAllItemFiles, createPersonData } from '../utils.js';
import { wouldCreateCycle } from '../dependencyGraph.js';
import { buildAllActiveDependencies } from '../stateBuilder.js';
import * as dependencyEvent from '../events/dependency.js';

/**
 * Add a dependency between items
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemNeeding - Item that needs another
 * @param {string} itemNeeded - Item that is needed
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function addDependency(baseDirectory, itemNeeding, itemNeeded, aggregateModel = null, gitOps = null) {
  // Verify both items exist
  await getItemDetails(baseDirectory, itemNeeding);
  await getItemDetails(baseDirectory, itemNeeded);

  // Get all active dependencies
  const allItemFiles = await getAllItemFiles(baseDirectory);
  const activeDeps = buildAllActiveDependencies(allItemFiles);

  // Check if dependency already exists (idempotent)
  const existingDeps = activeDeps.get(itemNeeding);
  if (existingDeps && existingDeps.has(itemNeeded)) {
    return; // Already active, ignore
  }

  // Check for cycles
  if (wouldCreateCycle(itemNeeding, itemNeeded, activeDeps)) {
    throw new Error(`Adding dependency from ${itemNeeding} to ${itemNeeded} would create a cycle`);
  }

  const person = await createPersonData();

  // Create dependency file using event handler
  const filename = await dependencyEvent.createLinkFile(baseDirectory, itemNeeding, itemNeeded, person);

  // Update aggregates if model provided (affects BOTH items)
  if (aggregateModel) {
    const eventData = { itemNeeding, itemNeeded, person };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}

/**
 * Remove a dependency between items
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemNeeding - Item that needs another
 * @param {string} itemNeeded - Item that is needed
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function removeDependency(baseDirectory, itemNeeding, itemNeeded, aggregateModel = null, gitOps = null) {
  // Verify both items exist
  await getItemDetails(baseDirectory, itemNeeding);
  await getItemDetails(baseDirectory, itemNeeded);

  // Get all active dependencies
  const allItemFiles = await getAllItemFiles(baseDirectory);
  const activeDeps = buildAllActiveDependencies(allItemFiles);

  // Check if dependency exists
  const existingDeps = activeDeps.get(itemNeeding);
  if (!existingDeps || !existingDeps.has(itemNeeded)) {
    return; // Not active, ignore (idempotent)
  }

  const person = await createPersonData();

  // Create unlink file using event handler
  const filename = await dependencyEvent.createUnlinkFile(baseDirectory, itemNeeding, itemNeeded, person);

  // Update aggregates if model provided (affects BOTH items)
  if (aggregateModel) {
    const eventData = { itemNeeding, itemNeeded, person };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}
