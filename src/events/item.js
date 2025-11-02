/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Item Creation Event Handler
 *
 * Filename format: <itemId>.json
 *
 * Parts:
 * - itemId: 8-digit unique identifier for the item
 * - .json: File extension
 *
 * This is the base file that creates an item and contains:
 * - itemId: The unique identifier
 * - tagline: Initial description
 * - status: Initial status (typically 'incomplete')
 * - person: {name, email, timestamp} of creator
 * - created: ISO timestamp when item was created
 */

import { join } from 'path';
import { writeJsonFile } from '../fileUtils.js';

/**
 * Create an item creation file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {string} tagline - Item description
 * @param {string} status - Initial status
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createFile(directory, itemId, tagline, status, person) {
  const filename = `${itemId}.json`;
  const itemPath = join(directory, filename);

  const itemData = {
    itemId,
    tagline,
    status,
    person,
    created: person.timestamp
  };

  await writeJsonFile(itemPath, itemData);

  // Controller will notify gitOps
  return filename;
}

/**
 * Read and parse an item creation file
 * @param {string} filename - Filename to parse
 * @param {Object} data - File data (already parsed JSON)
 * @returns {Object} Parsed object with type and details
 */
export function readAndReturnObject(filename, data) {
  return {
    type: 'item',
    itemId: data.itemId,
    tagline: data.tagline,
    status: data.status,
    person: data.person,
    created: data.created
  };
}
