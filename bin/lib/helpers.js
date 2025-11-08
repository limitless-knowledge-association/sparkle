/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Shared helper functions for CLI commands
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getGitRoot } from '../../src/gitBranchOps.js';

// Check if verbose logging is enabled (default: false for cleaner output)
const VERBOSE = process.env.SPARKLE_CLIENT_VERBOSE === 'true';

/**
 * Check if --json flag is present in arguments
 * @returns {boolean} True if --json flag is present
 */
export function hasJsonFlag() {
  return process.argv.includes('--json');
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
  console.log('  npx sparkle cat <itemId> [--json]         Display item details');
  console.log('  npx sparkle inspect <itemId> [--json]     Display item with full dependency chains');
  console.log('  npx sparkle browser                       Open Sparkle in browser');
  console.log('  npx sparkle find-item <search> [--json]   Search items by ID or tagline');
  console.log('  npx sparkle create-item "<tagline>" [--json]  Create new item and return ID');
  console.log('  npx sparkle add-entry <itemId> [--json]   Add entry (reads from stdin)');
  console.log('  npx sparkle alter <itemId> <field> <value> [--json]  Alter item field');
  console.log('');
  console.log('Alter fields:');
  console.log('  status <value>         Change status (must be valid status)');
  console.log('  monitoring <bool>      Set monitoring (yes/no, true/false, 1/0)');
  console.log('  visibility <bool>      Set visibility/ignored (yes=visible, no=hidden)');
  console.log('  responsibility <bool>  Take/release responsibility (yes/no, true/false, 1/0)');
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
  console.log('  npx sparkle alter 44332211 responsibility yes');
  console.log('');
}
