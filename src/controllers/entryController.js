/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Entry Controller - handles entry addition logic
 */

import { getItemDetails, createPersonData } from '../utils.js';
import * as entryEvent from '../events/entry.js';

/**
 * Add an entry to an item
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @param {string} text - Entry text
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function addEntry(baseDirectory, itemId, text, aggregateModel = null, gitOps = null) {
  // Verify item exists
  await getItemDetails(baseDirectory, itemId);

  const person = await createPersonData();

  // Create entry file using event handler
  const filename = await entryEvent.createFile(baseDirectory, itemId, text, person);

  // Update aggregate if model provided
  if (aggregateModel) {
    const eventData = { text, person };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}
