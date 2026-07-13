/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Alter command - Alter item fields (status, monitoring, visibility, responsibility)
 *
 * Thin daemon client: the daemon applies the change, commits immediately, and pushes
 * best-effort in the background.
 */

import { hasJsonFlag, validateItemId, getDataDirectory, parseBoolean } from '../lib/helpers.js';
import { ensureDaemon } from '../../src/cliDaemonLauncher.js';
import { makeApiRequest } from '../../src/daemonClient.js';

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
      console.log(JSON.stringify({ error: 'Field is required (status, monitoring, visibility, responsibility, tagline)' }));
    } else {
      console.error('Error: Field is required');
      console.error('Valid fields: status, monitoring, visibility, responsibility, tagline');
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
  const validFields = ['status', 'monitoring', 'visibility', 'responsibility', 'tagline'];
  if (!validFields.includes(fieldLower)) {
    if (useJson) {
      console.log(JSON.stringify({ error: `Invalid field: ${field}. Must be one of: ${validFields.join(', ')}` }));
    } else {
      console.error(`Error: Invalid field: ${field}`);
      console.error(`Valid fields: ${validFields.join(', ')}`);
    }
    process.exit(1);
  }

  // Map the field/value to a daemon endpoint + request body.
  let endpoint;
  let body = { itemId };
  let message;
  switch (fieldLower) {
    case 'status':
      endpoint = '/api/updateStatus';
      body = { itemId, status: value };
      message = `Status changed to ${value} for ${itemId}`;
      break;
    case 'tagline':
      endpoint = '/api/updateTagline';
      body = { itemId, tagline: value };
      message = `Tagline updated for ${itemId}`;
      break;
    case 'monitoring':
      if (parseBoolean(value)) {
        endpoint = '/api/addMonitor';
        message = `Monitoring enabled for ${itemId}`;
      } else {
        endpoint = '/api/removeMonitor';
        message = `Monitoring disabled for ${itemId}`;
      }
      break;
    case 'visibility':
      if (parseBoolean(value)) {
        endpoint = '/api/unignoreItem';
        message = `Visibility set to visible for ${itemId}`;
      } else {
        endpoint = '/api/ignoreItem';
        message = `Visibility set to hidden for ${itemId}`;
      }
      break;
    case 'responsibility':
      if (parseBoolean(value)) {
        endpoint = '/api/takeItem';
        message = `Responsibility taken for ${itemId}`;
      } else {
        endpoint = '/api/surrenderItem';
        message = `Responsibility released for ${itemId}`;
      }
      break;
  }

  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);

  try {
    await makeApiRequest(port, endpoint, 'POST', body);
  } catch (error) {
    // Surface the daemon's error (e.g. invalid status) with the original message.
    if (useJson) {
      console.log(JSON.stringify({ error: error.message }));
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }

  if (useJson) {
    console.log(JSON.stringify({ itemId, field: fieldLower, value, success: true, message }));
  } else {
    console.log(message);
  }
}
