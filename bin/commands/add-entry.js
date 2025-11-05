/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Add-entry command - Add entry to item (reads from stdin)
 */

import { hasJsonFlag, validateItemId, getDataDirectory, readStdin } from '../lib/helpers.js';

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

  // Get data directory
  const dataDir = await getDataDirectory(location);

  // Import Sparkle class
  const { Sparkle } = await import('../../src/sparkle-class.js');

  // Suppress console.log output to stdout (redirect to stderr for non-JSON mode)
  const originalConsoleLog = console.log;
  if (!useJson) {
    console.log = (...args) => console.error(...args);
  } else {
    console.log = () => {}; // Suppress completely in JSON mode
  }

  // Create Sparkle instance and start it
  const sparkle = new Sparkle(dataDir);
  await sparkle.start();

  try {
    // Add entry
    await sparkle.addEntry(itemId, text.trim());

    // Force immediate push
    await sparkle.gitOps.forcePushNow();

    // Restore console.log before output
    console.log = originalConsoleLog;

    // Output
    if (useJson) {
      console.log(JSON.stringify({ itemId, success: true, message: 'Entry added' }));
    } else {
      console.log(`Entry added to ${itemId}`);
    }

    // Stop sparkle instance
    await sparkle.stop();
  } catch (error) {
    console.log = originalConsoleLog;
    await sparkle.stop();
    throw error;
  }
}
