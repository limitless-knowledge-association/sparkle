/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Statuses commands - list the allowed status set and configure custom statuses.
 */

import { hasJsonFlag, daemonRequest, printList } from '../lib/helpers.js';

/**
 * List the allowed statuses (built-in + configured custom).
 * @param {string} location - Optional data directory
 */
export async function statusesCommand(location) {
  const useJson = hasJsonFlag();
  const res = await daemonRequest(location, '/api/allowedStatuses', 'GET');
  printList(useJson, res, res.statuses);
}

/**
 * Configure the full custom status set. 'incomplete' and 'completed' are always allowed
 * and need not be listed. Passing an empty list clears all custom statuses.
 * @param {string[]} statuses - Desired status names
 * @param {string} location - Optional data directory
 */
export async function setStatusesCommand(statuses, location) {
  const useJson = hasJsonFlag();

  // Always include the two built-ins so the daemon keeps them.
  const full = Array.from(new Set(['completed', 'incomplete', ...statuses]));

  try {
    await daemonRequest(location, '/api/updateStatuses', 'POST', { statuses: full });
  } catch (error) {
    if (useJson) console.log(JSON.stringify({ error: error.message }));
    else console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  // Report the resulting allowed set.
  const res = await daemonRequest(location, '/api/allowedStatuses', 'GET');
  if (useJson) {
    console.log(JSON.stringify({ success: true, statuses: res.statuses }));
  } else {
    console.log(`Statuses configured: ${res.statuses.join(', ')}`);
  }
}
