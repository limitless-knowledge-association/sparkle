/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Taken/Surrender Event Handler (Paired Events)
 *
 * Filename format: <itemId>.taken.<action>.<hash>.<timestamp>.<random>.json
 *
 * Parts:
 * - itemId: 8-digit item identifier
 * - taken: Event type identifier
 * - action: Either 'taken' or 'surrendered' indicating the operation
 * - hash: 8-character SHA256 hash of {name, email} to identify the person
 * - timestamp: YYYYMMDDHHmmssSSS format (UTC with milliseconds)
 * - random: 4-character random string [a-zA-Z0-9]
 * - .json: File extension
 *
 * These paired files record responsibility/ownership of an item:
 * - 'taken' indicates a person took responsibility for the item
 * - 'surrendered' indicates the person gave up responsibility
 *
 * Only one person can have an item taken at a time. The most recent
 * 'taken' event (regardless of person) determines who currently has it.
 *
 * File contains:
 * - person: {name, email, timestamp} of who took/surrendered the item
 */

import { join } from 'path';
import { generateFilename, hashObject } from '../nameUtils.js';
import { writeJsonFile } from '../fileUtils.js';

/**
 * Create a taken file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createTakeFile(directory, itemId, person) {
  const hash = hashObject({ name: person.name, email: person.email });
  const { filename, isoTimestamp } = await generateFilename(itemId, 'taken', `taken.${hash}`);
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  await writeJsonFile(filePath, { person: personData });

  // Controller will notify gitOps
  return filename;
}

/**
 * Create a surrendered file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemId - 8-digit item identifier
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createSurrenderFile(directory, itemId, person) {
  const hash = hashObject({ name: person.name, email: person.email });
  const { filename, isoTimestamp } = await generateFilename(itemId, 'taken', `surrendered.${hash}`);
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  await writeJsonFile(filePath, { person: personData });

  // Controller will notify gitOps
  return filename;
}

/**
 * Read and parse a taken file
 * @param {string} filename - Filename to parse
 * @param {Object} data - File data (already parsed JSON)
 * @returns {Object} Parsed object with type and details
 */
export function readAndReturnObject(filename, data) {
  const parts = filename.split('.');
  const action = parts[2]; // 'taken' or 'surrendered'

  return {
    type: 'taken',
    action,
    person: data.person,
    timestamp: data.person.timestamp
  };
}
