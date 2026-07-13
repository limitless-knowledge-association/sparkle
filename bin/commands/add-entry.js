/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Add-entry command - Add entry to item (reads from stdin)
 *
 * Thin daemon client: the daemon writes the entry, commits immediately, and pushes
 * best-effort in the background.
 */

import { hasJsonFlag, validateItemId, getDataDirectory, readStdin } from '../lib/helpers.js';
import { ensureDaemon } from '../../src/cliDaemonLauncher.js';
import { makeApiRequest } from '../../src/daemonClient.js';

/**
 * Add-entry command - Add entry to item (reads text from stdin)
 * @param {string} itemId - Item ID to add entry to
 * @param {string} location - Optional data directory location
 */
export async function addEntryCommand(itemId, location) {
  const useJson = hasJsonFlag();

  // Validate itemId format
  validateItemId(itemId, useJson);

  // Read entry text from stdin
  const text = await readStdin();

  if (!text || text.trim().length === 0) {
    if (useJson) {
      console.log(JSON.stringify({ error: 'Entry text is required (read from stdin)' }));
    } else {
      console.error('Error: Entry text is required (read from stdin)');
    }
    process.exit(1);
  }

  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);

  await makeApiRequest(port, '/api/addEntry', 'POST', { itemId, text: text.trim() });

  if (useJson) {
    console.log(JSON.stringify({ itemId, success: true, message: 'Entry added' }));
  } else {
    console.log(`Entry added to ${itemId}`);
  }
}
