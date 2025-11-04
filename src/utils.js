/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Shared utility functions for Sparkle
 */

import { join } from 'path';
import { getGitUser } from './gitUtils.js';
import { fileExists, getItemFiles, readMatchingFiles, readJsonFile } from './fileUtils.js';
import { buildItemState } from './stateBuilder.js';

/**
 * Create person data object with timestamp
 * @param {string} [isoTimestamp] - Optional ISO timestamp (defaults to now)
 * @returns {Promise<Object>} Person data object
 */
export async function createPersonData(isoTimestamp = null) {
  const user = await getGitUser();
  return {
    name: user.name,
    email: user.email,
    timestamp: isoTimestamp || new Date().toISOString()
  };
}

/**
 * Get all files for all items (used for building dependency graph)
 * @param {string} baseDirectory - Base directory for sparkle data
 * @returns {Promise<Map<string, Array>>} Map of itemId -> files
 */
export async function getAllItemFiles(baseDirectory) {
  const allFiles = await readMatchingFiles(baseDirectory, '');
  const itemsMap = new Map();

  // Group files by item ID
  for (const filename of allFiles) {
    // Skip system files like statuses.json
    if (filename === 'statuses.json') {
      continue;
    }

    const itemId = filename.split('.')[0];

    // Item IDs should be 8-digit numbers - skip anything else
    if (!/^\d{8}$/.test(itemId)) {
      continue;
    }

    if (!itemsMap.has(itemId)) {
      itemsMap.set(itemId, []);
    }
    const filePath = join(baseDirectory, filename);
    const data = await readJsonFile(filePath);
    itemsMap.get(itemId).push({ filename, data });
  }

  return itemsMap;
}

/**
 * Get item details
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @returns {Promise<Object>} Deep copy of item details
 */
export async function getItemDetails(baseDirectory, itemId) {
  const files = await getItemFiles(baseDirectory, itemId);

  if (files.length === 0) {
    throw new Error(`Item ${itemId} does not exist`);
  }

  const state = buildItemState(files);

  if (!state) {
    throw new Error(`Item ${itemId} does not exist`);
  }

  // Return deep copy
  return JSON.parse(JSON.stringify(state));
}

/**
 * Load allowed statuses from aggregate file if it exists
 * @param {string} baseDirectory - Base directory for sparkle data
 * @returns {Promise<Set<string>|null>} Set of allowed statuses, or null if no validation
 */
export async function loadAllowedStatuses(baseDirectory) {
  // Try new location first: .aggregates/statuses.json
  const aggregatePath = join(baseDirectory, '.aggregates', 'statuses.json');

  let data = null;

  if (fileExists(aggregatePath)) {
    try {
      data = await readJsonFile(aggregatePath);
    } catch (error) {
      throw new Error(`Error reading aggregate statuses.json: ${error.message}`);
    }
  } else {
    // Backward compatibility: try old location (root statuses.json)
    const legacyPath = join(baseDirectory, 'statuses.json');
    if (fileExists(legacyPath)) {
      try {
        data = await readJsonFile(legacyPath);
      } catch (error) {
        throw new Error(`Error reading legacy statuses.json: ${error.message}`);
      }
    }
  }

  // If no file exists, no validation is performed
  if (data === null) {
    return null;
  }

  // Validate that it's an array
  if (!Array.isArray(data)) {
    throw new Error('statuses.json must contain a JSON array');
  }

  // Create a set with the built-in allowed statuses plus custom ones
  const allowedStatuses = new Set(['completed', 'incomplete']);

  for (const status of data) {
    if (typeof status === 'string') {
      allowedStatuses.add(status);
    }
  }

  return allowedStatuses;
}

/**
 * Validate that a status is allowed
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} status - Status to validate
 * @throws {Error} If status validation fails
 */
export async function validateStatus(baseDirectory, status) {
  const allowedStatuses = await loadAllowedStatuses(baseDirectory);

  // If no statuses.json file exists, no validation is performed
  if (allowedStatuses === null) {
    return;
  }

  // Check if status is in the allowed set
  if (!allowedStatuses.has(status)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${Array.from(allowedStatuses).sort().join(', ')}`);
  }
}

/**
 * Get all allowed statuses (for UI purposes)
 * @param {string} baseDirectory - Base directory for sparkle data
 * @returns {Promise<Array<string>>} Array of allowed statuses
 */
export async function getAllowedStatuses(baseDirectory) {
  const allowedStatuses = await loadAllowedStatuses(baseDirectory);

  if (allowedStatuses === null) {
    // No custom statuses file, return just the mandatory ones
    return ['incomplete', 'completed'];
  }

  // Convert Set to sorted array
  return Array.from(allowedStatuses).sort();
}

/**
 * Get all known takers from the takers aggregate
 * @param {string} baseDirectory - Base directory for sparkle data
 * @returns {Promise<Array<Object>>} Array of takers [{name, email, hash}]
 */
export async function getTakers(baseDirectory) {
  const aggregatePath = join(baseDirectory, '.aggregates', 'takers.json');

  if (!fileExists(aggregatePath)) {
    // No takers file exists yet, return empty array
    return [];
  }

  try {
    const takers = await readJsonFile(aggregatePath);

    // Validate that it's an array
    if (!Array.isArray(takers)) {
      console.error('takers.json must contain a JSON array');
      return [];
    }

    return takers;
  } catch (error) {
    console.error(`Error reading takers.json: ${error.message}`);
    return [];
  }
}

