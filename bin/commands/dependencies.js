/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Dependency commands - add/remove dependencies between items (via the daemon).
 */

import { hasJsonFlag, validateItemId, daemonRequest } from '../lib/helpers.js';

function fail(useJson, message) {
  if (useJson) console.log(JSON.stringify({ error: message }));
  else console.error(`Error: ${message}`);
  process.exit(1);
}

/**
 * Add a dependency: itemNeeding depends on (is blocked by) itemNeeded.
 * @param {string} itemNeeding
 * @param {string} itemNeeded
 * @param {string} location - Optional data directory
 */
export async function addDependencyCommand(itemNeeding, itemNeeded, location) {
  const useJson = hasJsonFlag();
  validateItemId(itemNeeding, useJson);
  validateItemId(itemNeeded, useJson);

  try {
    await daemonRequest(location, '/api/addDependency', 'POST', { itemNeeding, itemNeeded });
  } catch (error) {
    fail(useJson, error.message);
  }

  const message = `${itemNeeding} now depends on ${itemNeeded}`;
  if (useJson) console.log(JSON.stringify({ itemNeeding, itemNeeded, success: true, message }));
  else console.log(message);
}

/**
 * Remove a dependency between two items.
 * @param {string} itemNeeding
 * @param {string} itemNeeded
 * @param {string} location - Optional data directory
 */
export async function removeDependencyCommand(itemNeeding, itemNeeded, location) {
  const useJson = hasJsonFlag();
  validateItemId(itemNeeding, useJson);
  validateItemId(itemNeeded, useJson);

  try {
    await daemonRequest(location, '/api/removeDependency', 'POST', { itemNeeding, itemNeeded });
  } catch (error) {
    fail(useJson, error.message);
  }

  const message = `${itemNeeding} no longer depends on ${itemNeeded}`;
  if (useJson) console.log(JSON.stringify({ itemNeeding, itemNeeded, success: true, message }));
  else console.log(message);
}
