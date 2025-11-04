/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Find-item command - Search items by ID or tagline
 */

import { ensureDaemon } from '../../src/cliDaemonLauncher.js';
import { makeApiRequest } from '../../src/daemonClient.js';
import { hasJsonFlag, getDataDirectory } from '../lib/helpers.js';

/**
 * Find-item command - Search items by ID or tagline (case-insensitive substring match)
 * @param {string} search - Search string
 * @param {string} location - Optional data directory location
 */
export async function findItemCommand(search, location) {
  const useJson = hasJsonFlag();

  if (!search || search.trim().length === 0) {
    if (useJson) {
      console.log(JSON.stringify({ error: 'Search string is required' }));
    } else {
      console.error('Error: Search string is required');
    }
    process.exit(1);
  }

  // Get data directory and ensure daemon is running
  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);

  // Get all items via daemon API
  const items = await makeApiRequest(port, '/api/getAllItems', 'GET');

  // Normalize search string for case-insensitive matching
  const searchLower = search.toLowerCase();

  // Filter items: match itemId or tagline (case-insensitive substring)
  const matches = items.filter(item => {
    const itemIdMatch = item.itemId && item.itemId.includes(searchLower);
    const taglineMatch = item.tagline && item.tagline.toLowerCase().includes(searchLower);
    return itemIdMatch || taglineMatch;
  });

  // JSON output
  if (useJson) {
    const results = matches.map(item => ({
      itemId: item.itemId,
      tagline: item.tagline || ''
    }));
    console.log(JSON.stringify(results));
    return;
  }

  // Human-readable output (one per line)
  if (matches.length === 0) {
    console.log('No items found');
    return;
  }

  for (const item of matches) {
    console.log(`${item.itemId}: ${item.tagline || '(no tagline)'}`);
  }
}
