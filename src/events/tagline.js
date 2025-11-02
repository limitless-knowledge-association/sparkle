/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Tagline Update Event Handler
 *
 * Filename format: <itemId>.tagline.<timestamp>.<random>.json
 *
 * Parts:
 * - itemId: 8-digit item identifier
 * - tagline: Event type identifier
 * - timestamp: YYYYMMDDHHmmssSSS format (UTC with milliseconds)
 * - random: 4-character random string [a-zA-Z0-9]
 * - .json: File extension
 *
 * This file records a tagline change for an item and contains:
 * - tagline: The new tagline text
 * - person: {name, email, timestamp} of who made the change
 */

import { join } from 'path';
import { generateFilename } from '../nameUtils.js';
import { writeJsonFile } from '../fileUtils.js';

/**
 * Create a tagline update file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {string} tagline - New tagline text
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createFile(directory, itemId, tagline, person) {
  const { filename, isoTimestamp } = await generateFilename(itemId, 'tagline');
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  const data = {
    tagline,
    person: personData
  };

  await writeJsonFile(filePath, data);

  // Controller will notify gitOps
  return filename;
}

/**
 * Read and parse a tagline update file
 * @param {string} filename - Filename to parse
 * @param {Object} data - File data (already parsed JSON)
 * @returns {Object} Parsed object with type and details
 */
export function readAndReturnObject(filename, data) {
  return {
    type: 'tagline',
    tagline: data.tagline,
    person: data.person,
    timestamp: data.person.timestamp
  };
}
