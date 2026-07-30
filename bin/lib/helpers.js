/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Shared helper functions for CLI commands
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getGitRoot } from '../../src/gitBranchOps.js';
import { ensureDaemon } from '../../src/cliDaemonLauncher.js';
import { makeApiRequest, makeRawApiRequest } from '../../src/daemonClient.js';

// Check if verbose logging is enabled (default: false for cleaner output)
const VERBOSE = process.env.SPARKLE_CLIENT_VERBOSE === 'true';

/**
 * Resolve the data dir, ensure a daemon is running, and make one API request.
 * Every CLI command goes through the daemon so all git (commit/push) has one owner.
 * @param {string} location - Optional explicit data directory
 * @param {string} path - API path (e.g. '/api/roots')
 * @param {string} [method='GET'] - HTTP method
 * @param {Object} [body=null] - Request body for POST
 * @returns {Promise<Object>} Parsed response
 */
export async function daemonRequest(location, path, method = 'GET', body = null) {
  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);
  return makeApiRequest(port, path, method, body);
}

/**
 * Like daemonRequest, but returns the response body verbatim with no JSON parsing.
 * Use for content that must survive byte-for-byte (a published status file).
 * @param {string} location - Optional explicit data directory
 * @param {string} path - API path
 * @returns {Promise<string>} Raw response body
 */
export async function daemonRawRequest(location, path) {
  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);
  return makeRawApiRequest(port, path);
}

/**
 * Print a list payload for a read command: raw JSON when --json, else a readable
 * line-per-entry rendering (plain strings as-is, objects as compact JSON).
 * @param {boolean} useJson
 * @param {Object} payload - Full response object (printed verbatim in --json mode)
 * @param {Array} items - The array to render in non-JSON mode
 * @param {Function} [render] - Optional (item) => string for non-JSON lines
 */
export function printList(useJson, payload, items, render = null) {
  if (useJson) {
    console.log(JSON.stringify(payload));
    return;
  }
  if (!items || items.length === 0) {
    console.log('(none)');
    return;
  }
  for (const item of items) {
    if (render) {
      console.log(render(item));
    } else if (typeof item === 'string') {
      console.log(item);
    } else {
      console.log(JSON.stringify(item));
    }
  }
}

/**
 * Check if --json flag is present in arguments
 * @returns {boolean} True if --json flag is present
 */
export function hasJsonFlag() {
  return process.argv.includes('--json');
}

/**
 * Flags that consume the argument after them (`--entry 3`).
 *
 * Exported because argument scanning elsewhere must skip a flag's VALUE as well as the
 * flag itself — otherwise `sparkle cat 12345678 --entry 3` reads the "3" as a data
 * directory, since it does not start with `--`.
 */
export const VALUE_FLAGS = new Set(['--entry']);

/**
 * Read the value of a value-taking flag. Accepts `--entry 3` and `--entry=3`.
 * @param {string} name - Flag name including leading dashes
 * @returns {string|undefined} The raw value, or undefined if the flag is absent
 */
export function getFlagValue(name) {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === name) {
      return argv[i + 1];
    }
    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
  }
  return undefined;
}

/**
 * Parse and validate the --entry flag: a 1-based entry sequence number.
 *
 * @param {boolean} useJson - Whether to emit errors as JSON
 * @returns {number|null} The requested seq, or null when --entry was not supplied
 */
export function getEntrySeq(useJson = false) {
  const raw = getFlagValue('--entry');

  if (raw === undefined) {
    return null;
  }

  const seq = Number(raw);
  if (!Number.isInteger(seq) || seq < 1) {
    const msg = `Invalid --entry value: ${raw === undefined ? '(missing)' : raw}. Expected a whole number starting at 1.`;
    if (useJson) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exit(1);
  }

  return seq;
}

/**
 * Select one entry from an item's entries by its seq.
 *
 * Falls back to positional index for aggregates written before seq existed and not yet
 * rebuilt, so an older data directory still resolves `--entry 2` to the second entry.
 *
 * @param {Array} entries - Entries in creation order
 * @param {number} seq - 1-based sequence number
 * @returns {Object|null} The entry, or null if there is no such seq
 */
export function selectEntryBySeq(entries, seq) {
  if (!Array.isArray(entries)) {
    return null;
  }
  return entries.find((entry, index) => (entry.seq ?? (index + 1)) === seq) || null;
}

/**
 * Parse boolean value from string
 * Accepts: yes/no, true/false, 1/0 (case insensitive)
 * @param {string} value - Value to parse
 * @returns {boolean} Parsed boolean value
 * @throws {Error} If value is not a valid boolean
 */
export function parseBoolean(value) {
  const normalized = String(value).toLowerCase().trim();
  if (['yes', 'true', '1'].includes(normalized)) {
    return true;
  }
  if (['no', 'false', '0'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}. Use yes/no, true/false, or 1/0`);
}

/**
 * Read all input from stdin
 * @returns {Promise<string>} All stdin content
 */
export async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', reject);
  });
}

/**
 * Validate item ID format
 * @param {string} itemId - Item ID to validate
 * @param {boolean} useJson - Whether to use JSON output
 * @returns {boolean} True if valid
 */
export function validateItemId(itemId, useJson = false) {
  if (!itemId || !/^\d{8}$/.test(itemId)) {
    if (useJson) {
      console.log(JSON.stringify({ error: 'Invalid item ID format. Item IDs must be 8 digits' }));
    } else {
      console.error(`Error: Invalid item ID: ${itemId}`);
      console.error('Item IDs must be 8 digits');
    }
    process.exit(1);
  }
  return true;
}

/**
 * Determine the data directory path
 * @param {string} locationArg - Optional explicit location argument
 * @returns {Promise<string>} Data directory path
 */
export async function getDataDirectory(locationArg) {
  const startTime = Date.now();
  if (VERBOSE) console.error(`[CLI] Determining data directory...`);

  // If location is explicitly provided, use it directly
  if (locationArg && locationArg !== '--json') {
    if (!existsSync(locationArg)) {
      throw new Error(`Data directory not found: ${locationArg}`);
    }
    const duration = Date.now() - startTime;
    if (VERBOSE) console.error(`[CLI] Using explicit location: ${locationArg} (${duration}ms)`);
    return locationArg;
  }

  // Otherwise, use sparkle_config from package.json
  const gitRoot = await getGitRoot();
  const packageJsonPath = join(gitRoot, 'package.json');

  if (!existsSync(packageJsonPath)) {
    throw new Error('package.json not found');
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  if (!packageJson.sparkle_config) {
    throw new Error('Sparkle is not configured in this repository (no sparkle_config in package.json)');
  }

  const config = packageJson.sparkle_config;
  const dataDir = config.directory;
  const worktreePath = config.worktree_path || '.sparkle-worktree';

  const worktreeDataPath = join(gitRoot, worktreePath, dataDir);
  // Don't check if worktreeDataPath exists - the daemon will create it if needed
  // This allows fresh clones to work (daemon calls setupFromExistingBranch())

  const duration = Date.now() - startTime;
  if (VERBOSE) console.error(`[CLI] Using config location: ${worktreeDataPath} (${duration}ms)`);
  return worktreeDataPath;
}

/**
 * Show usage help
 */
export function showHelp() {
  console.log('');
  console.log('Sparkle CLI - Unified command-line interface');
  console.log('');
  console.log('Usage:');
  console.log('  npx sparkle                               Show this help');
  console.log('');
  console.log('Read:');
  console.log('  npx sparkle cat <itemId> [--json]         Display item details');
  console.log('  npx sparkle cat <itemId> --entry <n> [--json]  Display one entry by its number');
  console.log('  npx sparkle inspect <itemId> [--json]     Display item with full dependency chains');
  console.log('  npx sparkle list [search] [--json]        List all items (optionally filtered)');
  console.log('  npx sparkle find-item <search> [--json]   Search items by ID or tagline');
  console.log('  npx sparkle roots [--json]                List root items (nothing depends on them)');
  console.log('  npx sparkle pending [--json]              List items pending work');
  console.log('  npx sparkle takers [--json]               List people who have taken items');
  console.log('  npx sparkle statuses [--json]             List the allowed status set');
  console.log('  npx sparkle list-status-files [--json]    List published status files');
  console.log('  npx sparkle fetch-status-file <name>      Print a status file to stdout');
  console.log('  npx sparkle audit <itemId> [--json]       Show an item\'s full audit trail');
  console.log('  npx sparkle candidates <itemId> [--dependents] [--json]  Items addable as (de)dependencies');
  console.log('  npx sparkle config get [--json]           Show project configuration');
  console.log('');
  console.log('Write:');
  console.log('  npx sparkle create-item "<tagline>" [--json]  Create new item and return ID');
  console.log('  npx sparkle add-entry <itemId> [--json]   Add entry (reads from stdin)');
  console.log('  npx sparkle alter <itemId> <field> <value> [--json]  Alter item field');
  console.log('  npx sparkle add-dependency <needing> <needed> [--json]     Make one item depend on another');
  console.log('  npx sparkle remove-dependency <needing> <needed> [--json]  Remove a dependency');
  console.log('  npx sparkle set-statuses <status>... [--json]  Configure the custom status set');
  console.log('  npx sparkle add-status-file <name> [--json]    Publish a status file (reads from stdin)');
  console.log('  npx sparkle remove-status-file <name> [--json] Remove a published status file');
  console.log('  npx sparkle config set <key> <value> [--json]  Set a project config key (e.g. port)');
  console.log('');
  console.log('  npx sparkle browser                       Open Sparkle in browser');
  console.log('');
  console.log('Alter fields:');
  console.log('  status <value>         Change status (must be a valid/allowed status)');
  console.log('  tagline "<text>"       Change the item tagline');
  console.log('  monitoring <bool>      Set monitoring (yes/no, true/false, 1/0)');
  console.log('  visibility <bool>      Set visibility/ignored (yes=visible, no=hidden)');
  console.log('  responsibility <bool>  Take/release responsibility (yes/no, true/false, 1/0)');
  console.log('');
  console.log('Entry numbers:');
  console.log('  Entries are numbered per item in creation order, starting at 1.');
  console.log('  The number is shown as "#n" by cat and inspect, and is stable — it never');
  console.log('  changes as entries are added, so it can be quoted and reused.');
  console.log('  Read one back with: npx sparkle cat <itemId> --entry <n>');
  console.log('');
  console.log('Location (optional for most commands):');
  console.log('  Add [location] before --json to specify data directory');
  console.log('  - If not specified: Uses sparkle_config from package.json');
  console.log('  - If specified: Direct path to sparkle data directory');
  console.log('');
  console.log('Examples:');
  console.log('  npx sparkle cat 44332211');
  console.log('  npx sparkle cat 44332211 --json');
  console.log('  npx sparkle find-item "test"');
  console.log('  npx sparkle find-item "test" --json');
  console.log('  npx sparkle create-item "Fix bug in parser"');
  console.log('  echo "Updated parser logic" | npx sparkle add-entry 44332211');
  console.log('  npx sparkle alter 44332211 status completed');
  console.log('  npx sparkle alter 44332211 tagline "Fix the parser properly"');
  console.log('  npx sparkle add-dependency 44332211 55667788');
  console.log('  npx sparkle set-statuses in-progress blocked');
  console.log('  npx sparkle audit 44332211 --json');
  console.log('');
}
