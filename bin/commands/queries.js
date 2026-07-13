/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Read/query commands - list, roots, pending, takers, audit, candidates (via the daemon).
 */

import { hasJsonFlag, daemonRequest, printList } from '../lib/helpers.js';

/**
 * List all items (optionally filtered by a search term matching id or tagline).
 * @param {string} [search] - Optional search term
 * @param {string} location - Optional data directory
 */
export async function listCommand(search, location) {
  const useJson = hasJsonFlag();
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await daemonRequest(location, `/api/allItems${qs}`, 'GET');
  printList(useJson, res, res.items, (i) => `${i.itemId}  [${i.status}] ${i.tagline}`);
}

/**
 * List root items (items nothing else depends on).
 * @param {string} location - Optional data directory
 */
export async function rootsCommand(location) {
  const useJson = hasJsonFlag();
  const res = await daemonRequest(location, '/api/roots', 'GET');
  printList(useJson, res, res.roots, (r) => `${r.itemId}${r.hasChildren ? ' (has children)' : ''}`);
}

/**
 * List items that are pending work (incomplete and actionable).
 * @param {string} location - Optional data directory
 */
export async function pendingCommand(location) {
  const useJson = hasJsonFlag();
  const res = await daemonRequest(location, '/api/pendingWork', 'GET');
  printList(useJson, res, res.items);
}

/**
 * List all known takers (people who have taken responsibility for items).
 * @param {string} location - Optional data directory
 */
export async function takersCommand(location) {
  const useJson = hasJsonFlag();
  const res = await daemonRequest(location, '/api/getTakers', 'GET');
  printList(useJson, res, res.takers, (t) => `${t.name} <${t.email}>`);
}

/**
 * Show the full audit trail (chronological events) for an item.
 * @param {string} itemId
 * @param {string} location - Optional data directory
 */
export async function auditCommand(itemId, location) {
  const useJson = hasJsonFlag();
  let res;
  try {
    res = await daemonRequest(location, '/api/getItemAuditTrail', 'POST', { itemId });
  } catch (error) {
    if (useJson) console.log(JSON.stringify({ error: error.message }));
    else console.error(`Error: ${error.message}`);
    process.exit(1);
  }
  if (res.error) {
    if (useJson) console.log(JSON.stringify(res));
    else console.error(`Error: ${res.error}`);
    process.exit(1);
  }
  printList(useJson, res, res.events);
}

/**
 * Show items that can be added as dependencies (or dependents) of an item, excluding
 * those that would create a cycle. Use --dependents for the reverse direction.
 * @param {string} itemId
 * @param {string} location - Optional data directory
 */
export async function candidatesCommand(itemId, location) {
  const useJson = hasJsonFlag();
  const dependents = process.argv.includes('--dependents');
  const endpoint = dependents ? '/api/getPotentialDependents' : '/api/getPotentialDependencies';

  let res;
  try {
    res = await daemonRequest(location, endpoint, 'POST', { itemId });
  } catch (error) {
    if (useJson) console.log(JSON.stringify({ error: error.message }));
    else console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  // Both endpoints return { candidates: [...], current: [...] }.
  printList(useJson, res, res.candidates, (c) => `${c.itemId}  ${c.tagline}`);
}
