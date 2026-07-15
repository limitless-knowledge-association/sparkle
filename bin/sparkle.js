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
import { addDependencyCommand, removeDependencyCommand } from './commands/dependencies.js';
import { statusesCommand, setStatusesCommand } from './commands/statuses.js';
import {
  addStatusFileCommand,
  removeStatusFileCommand,
  listStatusFilesCommand,
  fetchStatusFileCommand
} from './commands/status-files.js';
import { listCommand, rootsCommand, pendingCommand, takersCommand, auditCommand, candidatesCommand } from './commands/queries.js';
import { configCommand } from './commands/config.js';

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
  // The location is the first non-flag argument at or after argPosition.
  for (let i = argPosition; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a && !a.startsWith('--')) return a;
  }
  return undefined;
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

      case 'add-dependency':
        await addDependencyCommand(arg1, arg2, getLocationArg(5));
        break;

      case 'remove-dependency':
        await removeDependencyCommand(arg1, arg2, getLocationArg(5));
        break;

      case 'add-status-file':
        await addStatusFileCommand(arg1, getLocationArg(4));
        break;

      case 'remove-status-file':
        await removeStatusFileCommand(arg1, getLocationArg(4));
        break;

      case 'list-status-files':
        await listStatusFilesCommand(getLocationArg(3));
        break;

      case 'fetch-status-file':
        await fetchStatusFileCommand(arg1, getLocationArg(4));
        break;

      case 'set-statuses':
        await setStatusesCommand(
          process.argv.slice(3).filter(a => !a.startsWith('--')),
          undefined
        );
        break;

      case 'statuses':
        await statusesCommand(getLocationArg(3));
        break;

      case 'list':
        await listCommand(
          (arg1 && !arg1.startsWith('--')) ? arg1 : undefined,
          getLocationArg(4)
        );
        break;

      case 'roots':
        await rootsCommand(getLocationArg(3));
        break;

      case 'pending':
        await pendingCommand(getLocationArg(3));
        break;

      case 'takers':
        await takersCommand(getLocationArg(3));
        break;

      case 'audit':
        await auditCommand(arg1, getLocationArg(4));
        break;

      case 'candidates':
        await candidatesCommand(arg1, getLocationArg(4));
        break;

      case 'config':
        // config get [location] | config set <key> <value> [location]
        await configCommand(arg1, arg2, arg3, getLocationArg(arg1 === 'set' ? 6 : 4));
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
