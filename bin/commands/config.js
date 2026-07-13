/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Config command - read and set per-project configuration (via the daemon).
 *
 *   sparkle config get
 *   sparkle config set <key> <value>     (top-level scalar keys, e.g. port, darkMode)
 *
 * Note: custom statuses are configured with `sparkle set-statuses`, not here.
 */

import { hasJsonFlag, daemonRequest } from '../lib/helpers.js';

function parseValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

/**
 * @param {string} sub - 'get' or 'set'
 * @param {string} key - Config key (for set)
 * @param {string} value - Config value (for set)
 * @param {string} location - Optional data directory
 */
export async function configCommand(sub, key, value, location) {
  const useJson = hasJsonFlag();

  if (sub === 'get' || sub === undefined) {
    const res = await daemonRequest(location, '/api/config/get', 'POST', { localConfig: null });
    if (useJson) console.log(JSON.stringify(res));
    else console.log(JSON.stringify(res.merged, null, 2));
    return;
  }

  if (sub === 'set') {
    if (!key || value === undefined) {
      const msg = 'Usage: sparkle config set <key> <value>';
      if (useJson) console.log(JSON.stringify({ error: msg }));
      else console.error(`Error: ${msg}`);
      process.exit(1);
    }
    if (key.includes('.')) {
      const msg = 'Only top-level scalar keys are settable from the CLI (e.g. port, darkMode)';
      if (useJson) console.log(JSON.stringify({ error: msg }));
      else console.error(`Error: ${msg}`);
      process.exit(1);
    }

    // Read-merge-write: saveProjectConfig replaces, so start from the current project config.
    const current = await daemonRequest(location, '/api/config/get', 'POST', { localConfig: null });
    const project = { ...(current.project || {}) };
    project[key] = parseValue(value);

    const res = await daemonRequest(location, '/api/config/setProject', 'POST', project);

    if (useJson) {
      console.log(JSON.stringify({ success: true, key, value: project[key], portChanged: !!res.portChanged }));
    } else {
      console.log(`Set ${key} = ${JSON.stringify(project[key])}`);
      if (res.portChanged) console.log('Port changed — the daemon will restart.');
    }
    return;
  }

  const msg = `Unknown config subcommand: ${sub} (use 'get' or 'set')`;
  if (useJson) console.log(JSON.stringify({ error: msg }));
  else console.error(`Error: ${msg}`);
  process.exit(1);
}
