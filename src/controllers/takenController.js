/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Taken Controller - handles take/surrender logic
 */

import { getItemDetails, createPersonData } from '../utils.js';
import { hashObject } from '../nameUtils.js';
import * as takenEvent from '../events/taken.js';
import { addTakerToAggregate } from '../takersAggregate.js';

/**
 * Take responsibility for an item (only one person can take it at a time)
 * When someone takes an item, they automatically become the sole taker
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function takeItem(baseDirectory, itemId, aggregateModel = null, gitOps = null) {
  // Verify item exists
  const details = await getItemDetails(baseDirectory, itemId);

  const person = await createPersonData();
  const hash = hashObject({ name: person.name, email: person.email });

  // Check if this person already has it taken
  if (details.takenBy &&
      details.takenBy.name === person.name &&
      details.takenBy.email === person.email) {
    return; // Already taken by this person, idempotent
  }

  // Create taken file using event handler - this automatically supersedes any previous taker
  const filename = await takenEvent.createTakeFile(baseDirectory, itemId, person);

  // Update item aggregate if model provided
  if (aggregateModel) {
    const eventData = { person, hash };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Update takers aggregate (add this person to the set of known takers)
  try {
    await addTakerToAggregate(baseDirectory, person);
  } catch (error) {
    console.error('Failed to update takers aggregate:', error.message);
    // Don't fail the take operation if aggregate update fails
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}

/**
 * Surrender (un-take) responsibility for an item
 * Only the current taker can surrender
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function surrenderItem(baseDirectory, itemId, aggregateModel = null, gitOps = null) {
  // Verify item exists
  const details = await getItemDetails(baseDirectory, itemId);

  const person = await createPersonData();
  const hash = hashObject({ name: person.name, email: person.email });

  // Check if this person is the current taker
  if (!details.takenBy ||
      details.takenBy.name !== person.name ||
      details.takenBy.email !== person.email) {
    return; // Not the current taker, nothing to surrender (idempotent)
  }

  // Create surrendered file using event handler
  const filename = await takenEvent.createSurrenderFile(baseDirectory, itemId, person);

  // Update aggregate if model provided
  if (aggregateModel) {
    const eventData = { person, hash };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}
