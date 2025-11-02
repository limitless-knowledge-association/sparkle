/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Tagline Controller - handles tagline alteration logic
 */

import { getItemDetails, createPersonData } from '../utils.js';
import * as taglineEvent from '../events/tagline.js';

/**
 * Alter the tagline of an item
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @param {string} tagline - New tagline
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function alterTagline(baseDirectory, itemId, tagline, aggregateModel = null, gitOps = null) {
  if (!tagline || tagline.trim().length === 0) {
    throw new Error('Tagline cannot be empty or whitespace');
  }

  // Verify item exists
  await getItemDetails(baseDirectory, itemId);

  const person = await createPersonData();

  // Create tagline file using event handler
  const filename = await taglineEvent.createFile(baseDirectory, itemId, tagline.trim(), person);

  // Update aggregate if model provided
  if (aggregateModel) {
    const eventData = { tagline: tagline.trim(), person };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}
