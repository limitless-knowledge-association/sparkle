/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Entry Addition Event Handler
 *
 * Filename format: <itemId>.entry.<timestamp>.<random>.json
 *
 * Parts:
 * - itemId: 8-digit item identifier
 * - entry: Event type identifier
 * - timestamp: YYYYMMDDHHmmssSSS format (UTC with milliseconds)
 * - random: 4-character random string [a-zA-Z0-9]
 * - .json: File extension
 *
 * This file records a new entry/note added to an item and contains:
 * - text: The entry content
 * - person: {name, email, timestamp} of who added the entry
 */

import { join } from 'path';
import { generateFilename } from '../nameUtils.js';
import { writeJsonFile } from '../fileUtils.js';

/**
 * Create an entry addition file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {string} text - Entry text content
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createFile(directory, itemId, text, person) {
  const { filename, isoTimestamp } = await generateFilename(itemId, 'entry');
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  const data = {
    text,
    person: personData
  };

  await writeJsonFile(filePath, data);

  // Controller will notify gitOps
  return filename;
}

/**
 * Read and parse an entry addition file
 * @param {string} filename - Filename to parse
 * @param {Object} data - File data (already parsed JSON)
 * @returns {Object} Parsed object with type and details
 */
export function readAndReturnObject(filename, data) {
  return {
    type: 'entry',
    text: data.text,
    person: data.person,
    timestamp: data.person.timestamp
  };
}
