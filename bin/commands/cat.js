/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Cat command - Display item details
 */

import { ensureDaemon } from '../../src/cliDaemonLauncher.js';
import { makeApiRequest } from '../../src/daemonClient.js';
import {
  hasJsonFlag,
  validateItemId,
  getDataDirectory,
  getEntrySeq,
  selectEntryBySeq
} from '../lib/helpers.js';

// Check if verbose logging is enabled
const VERBOSE = process.env.SPARKLE_CLIENT_VERBOSE === 'true';

/**
 * Cat command - Display item details
 * @param {string} itemId - Item ID to display
 * @param {string} location - Optional data directory location
 */
export async function catCommand(itemId, location) {
  const totalStartTime = Date.now();
  const useJson = hasJsonFlag();
  const entrySeq = getEntrySeq(useJson);

  // Validate itemId format
  validateItemId(itemId, useJson);

  if (!useJson && VERBOSE) console.error(`[CLI] Cat command for item: ${itemId}`);

  // Get data directory and ensure daemon is running
  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);

  // Get item details via daemon API
  const fetchStartTime = Date.now();
  const details = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId });
  const fetchDuration = Date.now() - fetchStartTime;
  if (!useJson && VERBOSE) console.error(`[CLI] Fetched item details via daemon (${fetchDuration}ms)`);

  // --entry <n>: print just that one entry and stop. Entry numbers are the stable,
  // 1-based creation-order `seq` shown by a plain `cat`, so a number read out of one
  // command can be fed straight back into the next.
  if (entrySeq !== null) {
    const entry = selectEntryBySeq(details.entries, entrySeq);
    const total = (details.entries || []).length;

    if (!entry) {
      const msg = total === 0
        ? `Item ${itemId} has no entries`
        : `Item ${itemId} has no entry ${entrySeq} (valid range: 1-${total})`;
      if (useJson) {
        console.log(JSON.stringify({ error: msg, itemId, entryCount: total }));
      } else {
        console.error(`Error: ${msg}`);
      }
      process.exit(1);
    }

    if (useJson) {
      console.log(JSON.stringify({ itemId, entry }));
      return;
    }

    const timestamp = entry.person?.timestamp || entry.timestamp;
    const date = timestamp ? new Date(timestamp).toLocaleString() : 'unknown date';
    const author = entry.person?.name || entry.author || 'unknown';
    console.log('');
    console.log(`Item ${itemId} — entry ${entrySeq} of ${total}`);
    console.log(`[${date}] ${author}`);
    console.log('');
    console.log(entry.text);
    console.log('');
    return;
  }

  // JSON output
  if (useJson) {
    // Fetch dependency details for JSON output
    const dependenciesWithDetails = [];
    if (details.dependencies && details.dependencies.length > 0) {
      for (const depId of details.dependencies) {
        try {
          const depDetails = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId: depId });
          dependenciesWithDetails.push({
            itemId: depId,
            tagline: depDetails.tagline,
            status: depDetails.status
          });
        } catch (error) {
          dependenciesWithDetails.push({
            itemId: depId,
            error: 'details unavailable'
          });
        }
      }
    }

    console.log(JSON.stringify({
      itemId: details.itemId,
      tagline: details.tagline,
      status: details.status || 'incomplete',
      created: details.created,
      monitors: details.monitors || [],
      takenBy: details.takenBy || null,
      ignored: details.ignored || false,
      dependencies: dependenciesWithDetails,
      entries: details.entries || []
    }));
    return;
  }

  // Human-readable output
  console.log('');
  console.log('━'.repeat(80));
  console.log(`Item: ${details.itemId}`);
  console.log('━'.repeat(80));

  // Tagline
  if (details.tagline) {
    console.log(`\nTagline: ${details.tagline}`);
  }

  // Status
  const statusSymbol = details.status === 'completed' ? '✓' : '○';
  console.log(`Status: ${statusSymbol} ${details.status || 'incomplete'}`);

  // Created
  if (details.created) {
    const date = new Date(details.created).toLocaleString();
    console.log(`Created: ${date}`);
  }

  // Monitored
  if (details.monitors && details.monitors.length > 0) {
    console.log(`Monitored by: ${details.monitors.map(m => m.name || m.email).join(', ')}`);
  }

  // Taken
  if (details.takenBy) {
    console.log(`Taken by: ${details.takenBy.name || details.takenBy.email}`);
  }

  // Ignored
  if (details.ignored) {
    console.log(`Ignored: Yes`);
  }

  // Dependencies
  if (details.dependencies && details.dependencies.length > 0) {
    console.log(`\nDependencies (${details.dependencies.length}):`);
    const depsStartTime = Date.now();
    for (const depId of details.dependencies) {
      try {
        const depDetails = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId: depId });
        const status = depDetails.status === 'completed' ? '✓' : '○';
        const kind = depDetails.status === 'completed' ? 'completed' : 'incomplete';
        console.log(`  ${status} ${depId} [${kind}]${depDetails.tagline ? ': ' + depDetails.tagline : ''}`);
      } catch (error) {
        console.log(`  ? ${depId} [unknown]: (details unavailable)`);
      }
    }
    const depsDuration = Date.now() - depsStartTime;
    if (VERBOSE) console.error(`[CLI] Fetched ${details.dependencies.length} dependencies via daemon (${depsDuration}ms)`);
  }

  // Entries
  if (details.entries && details.entries.length > 0) {
    console.log(`\nEntries (${details.entries.length}):`);
    for (const [index, entry] of details.entries.entries()) {
      const timestamp = entry.person?.timestamp || entry.timestamp;
      const date = timestamp ? new Date(timestamp).toLocaleString() : 'unknown date';
      const author = entry.person?.name || entry.author || 'unknown';
      // seq is 1-based creation order, scoped to this item, so it can be referenced
      // unambiguously ("entry 3 of item 44332211"). Fall back to position for aggregates
      // written before seq existed and not yet rebuilt.
      const seq = entry.seq ?? (index + 1);
      console.log(`\n  #${seq} [${date}] ${author}`);
      console.log(`  ${entry.text}`);
    }
  }

  console.log('');
  console.log('━'.repeat(80));
  console.log('');

  const totalDuration = Date.now() - totalStartTime;
  if (VERBOSE) console.error(`[CLI] Cat command completed (${totalDuration}ms total)`);
}
