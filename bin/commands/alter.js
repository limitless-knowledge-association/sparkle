/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Alter command - Alter item fields (status, monitoring, visibility, responsibility)
 */

import { hasJsonFlag, validateItemId, getDataDirectory, parseBoolean } from '../lib/helpers.js';

/**
 * Alter command - Alter item field
 * @param {string} itemId - Item ID to alter
 * @param {string} field - Field to alter (status, monitoring, visibility, responsibility)
 * @param {string} value - New value for the field
 * @param {string} location - Optional data directory location
 */
export async function alterCommand(itemId, field, value, location) {
  const useJson = hasJsonFlag();

  // Validate itemId format
  validateItemId(itemId, useJson);

  if (!field) {
    if (useJson) {
      console.log(JSON.stringify({ error: 'Field is required (status, monitoring, visibility, responsibility)' }));
    } else {
      console.error('Error: Field is required');
      console.error('Valid fields: status, monitoring, visibility, responsibility');
    }
    process.exit(1);
  }

  if (value === undefined || value === null) {
    if (useJson) {
      console.log(JSON.stringify({ error: 'Value is required' }));
    } else {
      console.error('Error: Value is required');
    }
    process.exit(1);
  }

  const fieldLower = field.toLowerCase();

  // Validate field
  const validFields = ['status', 'monitoring', 'visibility', 'responsibility'];
  if (!validFields.includes(fieldLower)) {
    if (useJson) {
      console.log(JSON.stringify({ error: `Invalid field: ${field}. Must be one of: ${validFields.join(', ')}` }));
    } else {
      console.error(`Error: Invalid field: ${field}`);
      console.error(`Valid fields: ${validFields.join(', ')}`);
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
    let message = '';

    switch (fieldLower) {
      case 'status': {
        // Status change - let API validate
        try {
          await sparkle.updateStatus(itemId, value);
          message = `Status changed to ${value} for ${itemId}`;
        } catch (error) {
          // Re-throw with original API error message (better than our generic one)
          throw error;
        }
        break;
      }

      case 'monitoring': {
        // Monitoring - boolean: yes/true = monitor, no/false = don't monitor
        const shouldMonitor = parseBoolean(value);
        if (shouldMonitor) {
          await sparkle.addMonitor(itemId);
          message = `Monitoring enabled for ${itemId}`;
        } else {
          await sparkle.removeMonitor(itemId);
          message = `Monitoring disabled for ${itemId}`;
        }
        break;
      }

      case 'visibility': {
        // Visibility - boolean: yes/true = visible (not ignored), no/false = hidden (ignored)
        const shouldBeVisible = parseBoolean(value);
        if (shouldBeVisible) {
          await sparkle.unignoreItem(itemId);
          message = `Visibility set to visible for ${itemId}`;
        } else {
          await sparkle.ignoreItem(itemId);
          message = `Visibility set to hidden for ${itemId}`;
        }
        break;
      }

      case 'responsibility': {
        // Responsibility - boolean: yes/true = take, no/false = surrender (only if currently held)
        const shouldTake = parseBoolean(value);
        if (shouldTake) {
          await sparkle.takeItem(itemId);
          message = `Responsibility taken for ${itemId}`;
        } else {
          // Only surrender if we're the current taker (API handles this idempotently)
          await sparkle.surrenderItem(itemId);
          message = `Responsibility released for ${itemId}`;
        }
        break;
      }
    }

    // Force immediate push
    await sparkle.gitOps.forcePushNow();

    // Restore console.log before output
    console.log = originalConsoleLog;

    // Output
    if (useJson) {
      console.log(JSON.stringify({
        itemId,
        field: fieldLower,
        value,
        success: true,
        message
      }));
    } else {
      console.log(message);
    }

    // Stop sparkle instance
    await sparkle.stop();
  } catch (error) {
    console.log = originalConsoleLog;
    await sparkle.stop();

    // Output error
    if (useJson) {
      console.log(JSON.stringify({ error: error.message }));
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}
