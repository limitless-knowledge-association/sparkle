/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status Configuration Event Handler
 *
 * Filename format: statuses.<timestamp>.<random>.json
 *
 * Parts:
 * - statuses: Event type identifier
 * - timestamp: YYYYMMDDHHmmssSSS format (UTC with milliseconds)
 * - random: 4-character random string [a-zA-Z0-9]
 * - .json: File extension
 *
 * This file records changes to the global status configuration and contains:
 * - add: Array of custom status names to add (excluding 'incomplete' and 'completed')
 * - remove: Array of custom status names to remove
 * - person: {name, email, timestamp} of who made the change
 *
 * Legacy format (backward compatible):
 * - statuses: Array of custom status names (treated as all adds)
 */

import { join } from 'path';
import { generateFilename } from '../nameUtils.js';
import { writeJsonFile } from '../fileUtils.js';

/**
 * Create a status configuration file
 * @param {string} directory - Base directory for sparkle data (.sparkle-worktree/sparkle-data)
 * @param {Object} changes - Object with {add: [], remove: []} arrays
 * @param {Object} person - Person data {name, email, timestamp}
 * @returns {Promise<string>} Filename that was created
 */
export async function createFile(directory, changes, person) {
  // Use 'statuses' as a pseudo-itemId for filename generation
  // Format: statuses.<empty>.<timestamp>.<random>.json
  const { filename, isoTimestamp } = await generateFilename('statuses', '');
  const filePath = join(directory, '.sparkle-worktree', 'sparkle-data', filename);

  // Update person timestamp to match filename
  const personData = { ...person, timestamp: isoTimestamp };

  // Strip out incomplete/completed from both arrays
  const add = (changes.add || []).filter(s => s !== 'incomplete' && s !== 'completed');
  const remove = (changes.remove || []).filter(s => s !== 'incomplete' && s !== 'completed');

  const data = {
    add,
    remove,
    person: personData
  };

  // Block until write completes
  await writeJsonFile(filePath, data);

  // Controller will notify gitOps
  return filename;
}

/**
 * Read and parse a status configuration file
 * @param {string} filename - Filename to parse
 * @param {Object} data - File data (already parsed JSON)
 * @returns {Object} Parsed object with type and details
 */
export function readAndReturnObject(filename, data) {
  return {
    type: 'statusConfiguration',
    statuses: data.statuses,
    person: data.person,
    timestamp: data.person.timestamp
  };
}
