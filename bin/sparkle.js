#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle CLI - Unified command-line interface for Sparkle
 *
 * Usage:
 *   npx sparkle                     Show help
 *   npx sparkle cat <itemId>        Display item details
 *   npx sparkle inspect <itemId>    Display item with full dependency chains
 *   npx sparkle browser             Open Sparkle in browser (launches daemon if needed)
 *
 * Location (optional for cat/inspect):
 *   Add [location] as last argument to specify data directory
 *   - If not specified: Uses sparkle_config from package.json
 *   - If specified: Direct path to sparkle data directory
 *
 * Examples:
 *   npx sparkle cat 44332211
 *   npx sparkle inspect 44332211
 *   npx sparkle cat 44332211 /path/to/test/sparkle-data
 *   npx sparkle browser
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { getGitRoot } from '../src/gitBranchOps.js';

// Check if verbose logging is enabled (default: false for cleaner output)
const VERBOSE = process.env.SPARKLE_CLIENT_VERBOSE === 'true';
import { Sparkle } from '../src/sparkle-class.js';
import { spawnProcess } from '../src/execUtils.js';
import { ensureDaemon } from '../src/cliDaemonLauncher.js';
import { makeApiRequest } from '../src/daemonClient.js';
import { openBrowser } from '../src/browserLauncher.js';

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

/**
 * Show usage help
 */
function showHelp() {
  console.log('');
  console.log('Sparkle CLI - Unified command-line interface');
  console.log('');
  console.log('Usage:');
  console.log('  npx sparkle                     Show this help');
  console.log('  npx sparkle cat <itemId>        Display item details');
  console.log('  npx sparkle inspect <itemId>    Display item with full dependency chains');
  console.log('  npx sparkle browser             Open Sparkle in browser');
  console.log('');
  console.log('Location (optional for cat/inspect):');
  console.log('  Add [location] as last argument to specify data directory');
  console.log('  - If not specified: Uses sparkle_config from package.json');
  console.log('  - If specified: Direct path to sparkle data directory');
  console.log('');
  console.log('Examples:');
  console.log('  npx sparkle cat 44332211');
  console.log('  npx sparkle inspect 44332211');
  console.log('  npx sparkle cat 44332211 /path/to/test/sparkle-data');
  console.log('  npx sparkle browser');
  console.log('');
}

/**
 * Determine the data directory path
 */
async function getDataDirectory(locationArg) {
  const startTime = Date.now();
  if (VERBOSE) console.error(`[CLI] Determining data directory...`);

  // If location is explicitly provided, use it directly
  if (locationArg) {
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
  if (!existsSync(worktreeDataPath)) {
    throw new Error(`Sparkle data directory not found: ${worktreeDataPath}`);
  }

  const duration = Date.now() - startTime;
  if (VERBOSE) console.error(`[CLI] Using config location: ${worktreeDataPath} (${duration}ms)`);
  return worktreeDataPath;
}

/**
 * Initialize Sparkle instance
 */
async function initializeSparkle(dataDir) {
  const startTime = Date.now();
  console.error(`[CLI] Initializing Sparkle...`);

  const sparkle = new Sparkle(dataDir);
  await sparkle.start();

  const duration = Date.now() - startTime;
  console.error(`[CLI] Sparkle initialized (${duration}ms)`);

  return sparkle;
}

/**
 * Cat command - Display item details
 */
async function catCommand(itemId, location) {
  const totalStartTime = Date.now();

  // Validate itemId format
  if (!itemId || !/^\d{8}$/.test(itemId)) {
    console.error(`Error: Invalid item ID: ${itemId}`);
    console.error('Item IDs must be 8 digits');
    process.exit(1);
  }

  console.error(`[CLI] Cat command for item: ${itemId}`);

  // Get data directory and ensure daemon is running
  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);

  // Get item details via daemon API
  const fetchStartTime = Date.now();
  const details = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId });
  const fetchDuration = Date.now() - fetchStartTime;
  console.error(`[CLI] Fetched item details via daemon (${fetchDuration}ms)`);

  // Display item
  console.log('');
  console.log('━'.repeat(80));
  console.log(`Item: ${details.itemId}`);
  console.log('━'.repeat(80));

  // Tagline
  if (details.tagline) {
    console.log(`\nTagline: ${details.tagline}`);
  }

  // Status
  const statusSymbol = details.status === 'completed' ? '✓' : '○';
  console.log(`Status: ${statusSymbol} ${details.status || 'incomplete'}`);

  // Created
  if (details.created) {
    const date = new Date(details.created).toLocaleString();
    console.log(`Created: ${date}`);
  }

  // Monitored
  if (details.monitors && details.monitors.length > 0) {
    console.log(`Monitored by: ${details.monitors.map(m => m.name || m.email).join(', ')}`);
  }

  // Taken
  if (details.takenBy) {
    console.log(`Taken by: ${details.takenBy.name || details.takenBy.email}`);
  }

  // Ignored
  if (details.ignored) {
    console.log(`Ignored: Yes`);
  }

  // Dependencies
  if (details.dependencies && details.dependencies.length > 0) {
    console.log(`\nDependencies (${details.dependencies.length}):`);
    const depsStartTime = Date.now();
    for (const depId of details.dependencies) {
      try {
        const depDetails = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId: depId });
        const status = depDetails.status === 'completed' ? '✓' : '○';
        const kind = depDetails.status === 'completed' ? 'completed' : 'incomplete';
        console.log(`  ${status} ${depId} [${kind}]${depDetails.tagline ? ': ' + depDetails.tagline : ''}`);
      } catch (error) {
        console.log(`  ? ${depId} [unknown]: (details unavailable)`);
      }
    }
    const depsDuration = Date.now() - depsStartTime;
    console.error(`[CLI] Fetched ${details.dependencies.length} dependencies via daemon (${depsDuration}ms)`);
  }

  // Entries
  if (details.entries && details.entries.length > 0) {
    console.log(`\nEntries (${details.entries.length}):`);
    for (const entry of details.entries) {
      const timestamp = entry.person?.timestamp || entry.timestamp;
      const date = timestamp ? new Date(timestamp).toLocaleString() : 'unknown date';
      const author = entry.person?.name || entry.author || 'unknown';
      console.log(`\n  [${date}] ${author}`);
      console.log(`  ${entry.text}`);
    }
  }

  console.log('');
  console.log('━'.repeat(80));
  console.log('');

  const totalDuration = Date.now() - totalStartTime;
  console.error(`[CLI] Cat command completed (${totalDuration}ms total)`);
}

/**
 * Display a single item's details (helper for inspect)
 */
function displayItem(details, label = 'Item') {
  console.log('');
  console.log('─'.repeat(80));
  console.log(`${label}: ${details.itemId}`);
  console.log('─'.repeat(80));

  // Tagline
  if (details.tagline) {
    console.log(`Tagline: ${details.tagline}`);
  }

  // Status
  const statusSymbol = details.status === 'completed' ? '✓' : '○';
  console.log(`Status: ${statusSymbol} ${details.status || 'incomplete'}`);

  // Created
  if (details.created) {
    const date = new Date(details.created).toLocaleString();
    console.log(`Created: ${date}`);
  }

  // Entries
  if (details.entries && details.entries.length > 0) {
    console.log(`\nEntries (${details.entries.length}):`);
    for (const entry of details.entries) {
      const timestamp = entry.person?.timestamp || entry.timestamp;
      const date = timestamp ? new Date(timestamp).toLocaleString() : 'unknown date';
      const author = entry.person?.name || entry.author || 'unknown';
      console.log(`  • [${date}] ${author}`);
      console.log(`    ${entry.text}`);
    }
  } else {
    console.log('\nNo entries');
  }
}

/**
 * Inspect command - Display item with full dependency chains
 */
async function inspectCommand(itemId, location) {
  const totalStartTime = Date.now();

  // Validate itemId format
  if (!itemId || !/^\d{8}$/.test(itemId)) {
    console.error(`Error: Invalid item ID: ${itemId}`);
    console.error('Item IDs must be 8 digits');
    process.exit(1);
  }

  console.error(`[CLI] Inspect command for item: ${itemId}`);

  // Get data directory and ensure daemon is running
  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);

  // Get the anchor item via daemon API
  const fetchStartTime = Date.now();
  const anchorDetails = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId });
  const fetchDuration = Date.now() - fetchStartTime;
  console.error(`[CLI] Fetched anchor item via daemon (${fetchDuration}ms)`);

  console.log('');
  console.log('═'.repeat(80));
  console.log(`INSPECTOR VIEW - Anchor Item: ${itemId}`);
  console.log('═'.repeat(80));

  // Display anchor item
  displayItem(anchorDetails, 'ANCHOR');

  // Show dependencies (full chains)
  if (anchorDetails.dependencies && anchorDetails.dependencies.length > 0) {
    console.log('');
    console.log('═'.repeat(80));
    console.log(`DEPENDENCIES (${anchorDetails.dependencies.length} items needed by anchor)`);
    console.log('═'.repeat(80));

    const depsStartTime = Date.now();
    for (const depId of anchorDetails.dependencies) {
      try {
        const depDetails = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId: depId });
        displayItem(depDetails, 'DEPENDENCY');
      } catch (error) {
        console.log('');
        console.log('─'.repeat(80));
        console.log(`DEPENDENCY: ${depId}`);
        console.log('─'.repeat(80));
        console.log(`Error: ${error.message}`);
      }
    }
    const depsDuration = Date.now() - depsStartTime;
    console.error(`[CLI] Fetched ${anchorDetails.dependencies.length} dependencies via daemon (${depsDuration}ms)`);
  } else {
    console.log('');
    console.log('═'.repeat(80));
    console.log('DEPENDENCIES');
    console.log('═'.repeat(80));
    console.log('No dependencies');
  }

  // Show dependents (full chains)
  if (anchorDetails.dependents && anchorDetails.dependents.length > 0) {
    console.log('');
    console.log('═'.repeat(80));
    console.log(`DEPENDENTS (${anchorDetails.dependents.length} items that need anchor)`);
    console.log('═'.repeat(80));

    const deptsStartTime = Date.now();
    for (const depId of anchorDetails.dependents) {
      try {
        const depDetails = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId: depId });
        displayItem(depDetails, 'DEPENDENT');
      } catch (error) {
        console.log('');
        console.log('─'.repeat(80));
        console.log(`DEPENDENT: ${depId}`);
        console.log('─'.repeat(80));
        console.log(`Error: ${error.message}`);
      }
    }
    const deptsDuration = Date.now() - deptsStartTime;
    console.error(`[CLI] Fetched ${anchorDetails.dependents.length} dependents via daemon (${deptsDuration}ms)`);
  } else {
    console.log('');
    console.log('═'.repeat(80));
    console.log('DEPENDENTS');
    console.log('═'.repeat(80));
    console.log('No dependents');
  }

  console.log('');
  console.log('═'.repeat(80));
  console.log('');

  const totalDuration = Date.now() - totalStartTime;
  console.error(`[CLI] Inspect command completed (${totalDuration}ms total)`);
}

/**
 * Browser command - Open Sparkle in browser
 */
async function browserCommand() {
  try {
    const dataDir = await getDataDirectory();
    const port = await ensureDaemon(dataDir);

    // Open browser to daemon
    const url = `http://localhost:${port}`;
    console.log(`Opening Sparkle at ${url}`);
    await openBrowser(url);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // No command - show help
    if (!command) {
      showHelp();
      process.exit(0);
    }

    // Route to appropriate command
    switch (command) {
      case 'cat':
        await catCommand(arg1, arg2);
        break;

      case 'inspect':
        await inspectCommand(arg1, arg2);
        break;

      case 'browser':
        await browserCommand();
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;

      default:
        console.error(`Error: Unknown command: ${command}`);
        console.error('');
        showHelp();
        process.exit(1);
    }

  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.error(`Error: Item not found`);
      process.exit(1);
    }
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
