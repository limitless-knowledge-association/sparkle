/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Ignored Set/Clear Event Handler (Paired Events)
 *
 * Filename format: <itemId>.ignored.<action>.<timestamp>.<random>.json
 *
 * Parts:
 * - itemId: 8-digit item identifier
 * - ignored: Event type identifier
 * - action: Either 'set' or 'cleared' indicating the operation
 * - timestamp: YYYYMMDDHHmmssSSS format (UTC with milliseconds)
 * - random: 4-character random string [a-zA-Z0-9]
 * - .json: File extension
 *
 * These paired files record the ignored status of an item:
 * - 'set' marks the item as ignored (typically to hide from views)
 * - 'cleared' unmarks the item (makes it visible again)
 *
 * File contains:
 * - person: {name, email, timestamp} of who set/cleared the ignored flag
 */

import { join } from 'path';
import { generateFilename } from '../nameUtils.js';
import { writeJsonFile } from '../fileUtils.js';

/**
 * Create an ignored set file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createSetFile(directory, itemId, person) {
  const { filename, isoTimestamp } = await generateFilename(itemId, 'ignored', 'set');
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  await writeJsonFile(filePath, { person: personData });

  // Controller will notify gitOps
  return filename;
}

/**
 * Create an ignored clear file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createClearFile(directory, itemId, person) {
  const { filename, isoTimestamp } = await generateFilename(itemId, 'ignored', 'cleared');
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  await writeJsonFile(filePath, { person: personData });

  // Controller will notify gitOps
  return filename;
}

/**
 * Read and parse an ignored file
 * @param {string} filename - Filename to parse
 * @param {Object} data - File data (already parsed JSON)
 * @returns {Object} Parsed object with type and details
 */
export function readAndReturnObject(filename, data) {
  const parts = filename.split('.');
  const action = parts[2]; // 'set' or 'cleared'

  return {
    type: 'ignored',
    action,
    person: data.person,
    timestamp: data.person.timestamp
  };
}
