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
 *   npx sparkle find-item <search>  Search items by ID or tagline
 *   npx sparkle create-item "<tagline>"  Create new item and return ID
 *   npx sparkle add-entry <itemId>  Add entry (reads from stdin)
 *   npx sparkle alter <itemId> <field> <value>  Alter item field
 *
 * Location (optional for most commands):
 *   Add [location] before --json flag to specify data directory
 *   - If not specified: Uses sparkle_config from package.json
 *   - If specified: Direct path to sparkle data directory
 *
 * Examples:
 *   npx sparkle cat 44332211
 *   npx sparkle find-item "test"
 *   npx sparkle create-item "Fix bug in parser"
 *   echo "Updated parser logic" | npx sparkle add-entry 44332211
 *   npx sparkle alter 44332211 status completed
 *   npx sparkle alter 44332211 responsibility yes
 */

import { showHelp } from './lib/helpers.js';
import { catCommand } from './commands/cat.js';
import { inspectCommand } from './commands/inspect.js';
import { browserCommand } from './commands/browser.js';
import { findItemCommand } from './commands/find-item.js';
import { createItemCommand } from './commands/create-item.js';
import { addEntryCommand } from './commands/add-entry.js';
import { alterCommand } from './commands/alter.js';

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];
const arg3 = process.argv[5];
const arg4 = process.argv[6];

/**
 * Get location argument, filtering out --json flag
 * For commands with format: cmd arg1 [location] [--json]
 */
function getLocationArg(argPosition) {
  const arg = process.argv[argPosition];
  if (arg === '--json' || arg === undefined) {
    // Check if there's another arg after --json
    const nextArg = process.argv[argPosition + 1];
    if (nextArg && nextArg !== '--json') {
      return nextArg;
    }
    return undefined;
  }
  return arg;
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
        await catCommand(arg1, getLocationArg(4));
        break;

      case 'inspect':
        await inspectCommand(arg1, getLocationArg(4));
        break;

      case 'browser':
        await browserCommand();
        break;

      case 'find-item':
        await findItemCommand(arg1, getLocationArg(4));
        break;

      case 'create-item':
        await createItemCommand(arg1, getLocationArg(4));
        break;

      case 'add-entry':
        await addEntryCommand(arg1, getLocationArg(4));
        break;

      case 'alter':
        await alterCommand(arg1, arg2, arg3, getLocationArg(6));
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
