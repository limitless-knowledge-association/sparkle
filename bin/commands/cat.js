/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Cat command - Display item details
 */

import { ensureDaemon } from '../../src/cliDaemonLauncher.js';
import { makeApiRequest } from '../../src/daemonClient.js';
import { hasJsonFlag, validateItemId, getDataDirectory } from '../lib/helpers.js';

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
    for (const entry of details.entries) {
      const timestamp = entry.person?.timestamp || entry.timestamp;
      const date = timestamp ? new Date(timestamp).toLocaleString() : 'unknown date';
      const author = entry.person?.name || entry.author || 'unknown';
      console.log(`\n  [${date}] ${author}`);
      console.log(`  ${entry.text}`);
    }
  }

  console.log('');
  console.log('━'.repeat(80));
  console.log('');

  const totalDuration = Date.now() - totalStartTime;
  if (VERBOSE) console.error(`[CLI] Cat command completed (${totalDuration}ms total)`);
}
