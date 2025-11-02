/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Item Controller - handles item creation logic
 */

import { join } from 'path';
import { generateItemId } from '../nameUtils.js';
import { fileExists } from '../fileUtils.js';
import { createPersonData, validateStatus } from '../utils.js';
import * as itemEvent from '../events/item.js';
import * as entryController from './entryController.js';

/**
 * Create a new item
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} tagline - Short description of the item
 * @param {string} [status='incomplete'] - Initial status
 * @param {string} [initialEntry] - Optional initial entry text
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 * @returns {Promise<string>} Item ID
 */
export async function createItem(baseDirectory, tagline, status = 'incomplete', initialEntry, aggregateModel = null, gitOps = null) {
  if (!tagline || tagline.trim().length === 0) {
    throw new Error('Tagline cannot be empty or whitespace');
  }

  if (status === 'completed') {
    throw new Error('Cannot create an item with status "completed"');
  }

  // Validate status against statuses.json if it exists
  await validateStatus(baseDirectory, status);

  // Generate unique item ID
  let itemId;
  let itemPath;
  do {
    itemId = generateItemId();
    itemPath = join(baseDirectory, `${itemId}.json`);
  } while (fileExists(itemPath));

  // Create person data
  const person = await createPersonData();

  // Create item file using event handler
  const filename = await itemEvent.createFile(baseDirectory, itemId, tagline.trim(), status, person);

  // Update aggregate if model provided
  if (aggregateModel) {
    const eventData = { tagline: tagline.trim(), status, person };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }

  // Add initial entry if provided
  if (initialEntry && initialEntry.trim().length > 0) {
    await entryController.addEntry(baseDirectory, itemId, initialEntry.trim(), aggregateModel, gitOps);
  }

  return itemId;
}
