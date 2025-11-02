/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Dependency Link/Unlink Event Handler (Paired Events)
 *
 * Filename format: <itemNeeding>.dependency.<action>.<itemNeeded>.<timestamp>.<random>.json
 *
 * Parts:
 * - itemNeeding: 8-digit identifier of the item that depends on another
 * - dependency: Event type identifier
 * - action: Either 'linked' or 'unlinked' indicating the operation
 * - itemNeeded: 8-digit identifier of the item being depended upon
 * - timestamp: YYYYMMDDHHmmssSSS format (UTC with milliseconds)
 * - random: 4-character random string [a-zA-Z0-9]
 * - .json: File extension
 *
 * These paired files record dependency relationships between items:
 * - 'linked' creates a dependency (itemNeeding depends on itemNeeded)
 * - 'unlinked' removes a dependency
 *
 * File contains:
 * - person: {name, email, timestamp} of who created/removed the dependency
 */

import { join } from 'path';
import { generateFilename } from '../nameUtils.js';
import { writeJsonFile } from '../fileUtils.js';

/**
 * Create a dependency link file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemNeeding - Item that needs another
 * @param {string} itemNeeded - Item that is needed
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createLinkFile(directory, itemNeeding, itemNeeded, person) {
  const { filename, isoTimestamp } = await generateFilename(itemNeeding, 'dependency', `linked.${itemNeeded}`);
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  await writeJsonFile(filePath, { person: personData });

  // Controller will notify gitOps
  return filename;
}

/**
 * Create a dependency unlink file
 * @param {string} directory - Base directory for sparkle data
 * @param {string} itemNeeding - Item that needs another
 * @param {string} itemNeeded - Item that is needed
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createUnlinkFile(directory, itemNeeding, itemNeeded, person) {
  const { filename, isoTimestamp } = await generateFilename(itemNeeding, 'dependency', `unlinked.${itemNeeded}`);
  const filePath = join(directory, filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  await writeJsonFile(filePath, { person: personData });

  // Controller will notify gitOps
  return filename;
}

/**
 * Read and parse a dependency file
 * @param {string} filename - Filename to parse
 * @param {Object} data - File data (already parsed JSON)
 * @returns {Object} Parsed object with type and details
 */
export function readAndReturnObject(filename, data) {
  const parts = filename.split('.');
  const action = parts[2]; // 'linked' or 'unlinked'
  const itemNeeded = parts[3]; // target item ID

  return {
    type: 'dependency',
    action,
    itemNeeded,
    person: data.person,
    timestamp: data.person.timestamp
  };
}
