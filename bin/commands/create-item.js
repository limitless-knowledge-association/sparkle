/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Create-item command - Create new item and return ID
 *
 * Thin daemon client: all mutations (and all git) go through the daemon, which commits
 * immediately (local, safe) and pushes best-effort in the background.
 */

import { hasJsonFlag, getDataDirectory } from '../lib/helpers.js';
import { ensureDaemon } from '../../src/cliDaemonLauncher.js';
import { makeApiRequest } from '../../src/daemonClient.js';

/**
 * Create-item command - Create new item and return ID
 * @param {string} tagline - Item tagline
 * @param {string} location - Optional data directory location
 */
export async function createItemCommand(tagline, location) {
  const useJson = hasJsonFlag();

  if (!tagline || tagline.trim().length === 0) {
    if (useJson) {
      console.log(JSON.stringify({ error: 'Tagline is required' }));
    } else {
      console.error('Error: Tagline is required');
    }
    process.exit(1);
  }

  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);

  // The daemon creates the item, commits it immediately, and schedules a best-effort push.
  const { itemId } = await makeApiRequest(port, '/api/createItem', 'POST', {
    tagline: tagline.trim(),
    status: 'incomplete'
  });

  if (useJson) {
    console.log(JSON.stringify({ itemId, tagline: tagline.trim() }));
  } else {
    // Just output the ID for easy capture
    console.log(itemId);
  }
}
