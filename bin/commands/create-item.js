/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Create-item command - Create new item and return ID
 */

import { pathToFileURL } from 'url';
import { join } from 'path';
import { hasJsonFlag, getDataDirectory } from '../lib/helpers.js';

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

  // Get data directory
  const dataDir = await getDataDirectory(location);

  // We need to use the Sparkle class directly (not daemon) to create items
  // Import Sparkle class dynamically from the installation
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
    // Create item with default status 'incomplete'
    const itemId = await sparkle.createItem(tagline, 'incomplete');

    // Force immediate push
    await sparkle.gitOps.forcePushNow();

    // Restore console.log before output
    console.log = originalConsoleLog;

    // JSON output
    if (useJson) {
      console.log(JSON.stringify({ itemId, tagline }));
    } else {
      // Just output the ID for easy capture
      console.log(itemId);
    }

    // Stop sparkle instance
    await sparkle.stop();
  } catch (error) {
    console.log = originalConsoleLog;
    await sparkle.stop();
    throw error;
  }
}
