/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status Update Event Handler
 *
 * Filename format: <itemId>.status.<timestamp>.<random>.json
 *
 * Parts:
 * - itemId: 8-digit item identifier
 * - status: Event type identifier
 * - timestamp: YYYYMMDDHHmmssSSS format (UTC with milliseconds)
 * - random: 4-character random string [a-zA-Z0-9]
 * - .json: File extension
 *
 * This file records a status change for an item and contains:
 * - status: The new status value (e.g., 'incomplete', 'completed', or custom status)
 * - text: Optional explanation text for the status change
 * - person: {name, email, timestamp} of who made the change
 */

import { join } from 'path';
import { generateFilename } from '../nameUtils.js';
import { writeJsonFile } from '../fileUtils.js';

/**
 * Create a status update file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {string} status - New status value
 * @param {string} text - Optional explanation text
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createFile(directory, itemId, status, text, person) {
  const { filename, isoTimestamp } = await generateFilename(itemId, 'status');
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  const data = {
    status,
    text,
    person: personData
  };

  await writeJsonFile(filePath, data);

  // Controller will notify gitOps
  return filename;
}

/**
 * Read and parse a status update file
 * @param {string} filename - Filename to parse
 * @param {Object} data - File data (already parsed JSON)
 * @returns {Object} Parsed object with type and details
 */
export function readAndReturnObject(filename, data) {
  return {
    type: 'status',
    status: data.status,
    text: data.text || '',
    person: data.person,
    timestamp: data.person.timestamp
  };
}
