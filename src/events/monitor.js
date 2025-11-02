/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Monitor Add/Remove Event Handler (Paired Events)
 *
 * Filename format: <itemId>.monitor.<action>.<hash>.<timestamp>.<random>.json
 *
 * Parts:
 * - itemId: 8-digit item identifier
 * - monitor: Event type identifier
 * - action: Either 'added' or 'removed' indicating the operation
 * - hash: 8-character SHA256 hash of {name, email} to identify the person
 * - timestamp: YYYYMMDDHHmmssSSS format (UTC with milliseconds)
 * - random: 4-character random string [a-zA-Z0-9]
 * - .json: File extension
 *
 * These paired files record monitor relationships for items:
 * - 'added' indicates a person started monitoring the item
 * - 'removed' indicates a person stopped monitoring the item
 *
 * File contains:
 * - person: {name, email, timestamp} of the monitor
 */

import { join } from 'path';
import { generateFilename, hashObject } from '../nameUtils.js';
import { writeJsonFile } from '../fileUtils.js';

/**
 * Create a monitor add file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createAddFile(directory, itemId, person) {
  const hash = hashObject({ name: person.name, email: person.email });
  const { filename, isoTimestamp } = await generateFilename(itemId, 'monitor', `added.${hash}`);
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  await writeJsonFile(filePath, { person: personData });

  // Controller will notify gitOps
  return filename;
}

/**
 * Create a monitor remove file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createRemoveFile(directory, itemId, person) {
  const hash = hashObject({ name: person.name, email: person.email });
  const { filename, isoTimestamp } = await generateFilename(itemId, 'monitor', `removed.${hash}`);
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  await writeJsonFile(filePath, { person: personData });

  // Controller will notify gitOps
  return filename;
}

/**
 * Read and parse a monitor file
 * @param {string} filename - Filename to parse
 * @param {Object} data - File data (already parsed JSON)
 * @returns {Object} Parsed object with type and details
 */
export function readAndReturnObject(filename, data) {
  const parts = filename.split('.');
  const action = parts[2]; // 'added' or 'removed'

  return {
    type: 'monitor',
    action,
    person: data.person,
    timestamp: data.person.timestamp
  };
}
