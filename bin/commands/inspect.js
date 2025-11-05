/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Inspect command - Display item with full dependency chains
 * Uses /api/dag to match inspector UX behavior exactly
 */

import { ensureDaemon } from '../../src/cliDaemonLauncher.js';
import { makeApiRequest } from '../../src/daemonClient.js';
import { hasJsonFlag, validateItemId, getDataDirectory } from '../lib/helpers.js';

// Check if verbose logging is enabled
const VERBOSE = process.env.SPARKLE_CLIENT_VERBOSE === 'true';

/**
 * Display a single item's details (helper for human-readable output)
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
 * @param {string} itemId - Item ID to inspect
 * @param {string} location - Optional data directory location
 */
export async function inspectCommand(itemId, location) {
  const totalStartTime = Date.now();
  const useJson = hasJsonFlag();

  // Validate itemId format
  validateItemId(itemId, useJson);

  if (!useJson && VERBOSE) console.error(`[CLI] Inspect command for item: ${itemId}`);

  // Get data directory and ensure daemon is running
  const dataDir = await getDataDirectory(location);
  const port = await ensureDaemon(dataDir);

  // Get the DAG data via daemon API (same as inspector UX)
  const fetchStartTime = Date.now();
  const dagData = await makeApiRequest(port, `/api/dag?referenceId=${encodeURIComponent(itemId)}`, 'GET');
  const fetchDuration = Date.now() - fetchStartTime;
  if (!useJson && VERBOSE) console.error(`[CLI] Fetched DAG data via daemon (${fetchDuration}ms)`);

  if (!dagData || !dagData.nodes || dagData.nodes.length === 0) {
    if (useJson) {
      console.log(JSON.stringify({ error: 'No DAG data returned' }));
    } else {
      console.error('Error: No DAG data returned');
    }
    process.exit(1);
  }

  // Find the anchor node (depth 0)
  const anchorNode = dagData.nodes.find(node => node.depth === 0);
  if (!anchorNode) {
    if (useJson) {
      console.log(JSON.stringify({ error: 'Anchor node not found in DAG' }));
    } else {
      console.error('Error: Anchor node not found in DAG');
    }
    process.exit(1);
  }

  // Get full details for anchor
  const anchorDetails = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId });

  // Show relationship lists for anchor
  const dependsOn = anchorNode.full?.dependsOn || [];
  const providesTo = anchorNode.full?.providesTo || [];

  // Separate nodes into dependencies and providers
  const dependencyNodes = [];
  const providerNodes = [];

  for (const node of dagData.nodes) {
    if (node.item === itemId) continue; // Skip anchor

    // Dependencies are items that the anchor depends on (depth > 0, in dependsOn chain)
    // Providers are items that depend on the anchor (depth > 0, in providesTo chain)
    if (dependsOn.includes(node.item)) {
      dependencyNodes.push(node);
    } else if (providesTo.includes(node.item)) {
      providerNodes.push(node);
    } else {
      // This node is part of a deeper chain
      // Check if it's in the dependency subtree or provider subtree
      const isInDependencyChain = dagData.nodes.some(n =>
        dependsOn.includes(n.item) && n.full?.dependsOn?.includes(node.item)
      );
      if (isInDependencyChain || node.depth < anchorNode.depth) {
        dependencyNodes.push(node);
      } else {
        providerNodes.push(node);
      }
    }
  }

  // JSON output
  if (useJson) {
    // Fetch all details for JSON output
    const dependencies = [];
    for (const node of dependencyNodes) {
      try {
        const details = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId: node.item });
        dependencies.push({
          itemId: node.item,
          tagline: details.tagline,
          status: details.status,
          dependsOn: node.full?.dependsOn || [],
          providesTo: node.full?.providesTo || []
        });
      } catch (error) {
        dependencies.push({
          itemId: node.item,
          error: 'details unavailable'
        });
      }
    }

    const providers = [];
    for (const node of providerNodes) {
      try {
        const details = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId: node.item });
        providers.push({
          itemId: node.item,
          tagline: details.tagline,
          status: details.status,
          dependsOn: node.full?.dependsOn || [],
          providesTo: node.full?.providesTo || []
        });
      } catch (error) {
        providers.push({
          itemId: node.item,
          error: 'details unavailable'
        });
      }
    }

    console.log(JSON.stringify({
      anchor: {
        itemId: anchorDetails.itemId,
        tagline: anchorDetails.tagline,
        status: anchorDetails.status,
        created: anchorDetails.created,
        entries: anchorDetails.entries || [],
        dependsOn,
        providesTo
      },
      dependencies,
      providers
    }));
    return;
  }

  // Human-readable output
  console.log('');
  console.log('═'.repeat(80));
  console.log(`INSPECTOR VIEW - Anchor Item: ${itemId}`);
  console.log('═'.repeat(80));

  displayItem(anchorDetails, 'ANCHOR');

  console.log('');
  console.log(`Dependencies (needs): [${dependsOn.join(', ')}]`);
  console.log(`Providers (needed by): [${providesTo.join(', ')}]`);

  // Show dependencies (full chains)
  if (dependencyNodes.length > 0) {
    console.log('');
    console.log('═'.repeat(80));
    console.log(`DEPENDENCIES (${dependencyNodes.length} items in dependency tree)`);
    console.log('═'.repeat(80));

    const depsStartTime = Date.now();
    for (const node of dependencyNodes) {
      const depId = node.item;
      const depDependsOn = node.full?.dependsOn || [];
      const depProvidesTo = node.full?.providesTo || [];

      try {
        const depDetails = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId: depId });
        displayItem(depDetails, 'DEPENDENCY');
        console.log(`  Dependencies: [${depDependsOn.join(', ')}]`);
        console.log(`  Providers: [${depProvidesTo.join(', ')}]`);
      } catch (error) {
        console.log('');
        console.log('─'.repeat(80));
        console.log(`DEPENDENCY: ${depId}`);
        console.log('─'.repeat(80));
        console.log(`Error: ${error.message}`);
      }
    }
    const depsDuration = Date.now() - depsStartTime;
    if (VERBOSE) console.error(`[CLI] Fetched ${dependencyNodes.length} dependencies via daemon (${depsDuration}ms)`);
  } else {
    console.log('');
    console.log('═'.repeat(80));
    console.log('DEPENDENCIES');
    console.log('═'.repeat(80));
    console.log('No dependencies');
  }

  // Show providers (full chains)
  if (providerNodes.length > 0) {
    console.log('');
    console.log('═'.repeat(80));
    console.log(`PROVIDERS (${providerNodes.length} items that depend on anchor)`);
    console.log('═'.repeat(80));

    const deptsStartTime = Date.now();
    for (const node of providerNodes) {
      const provId = node.item;
      const provDependsOn = node.full?.dependsOn || [];
      const provProvidesTo = node.full?.providesTo || [];

      try {
        const provDetails = await makeApiRequest(port, '/api/getItemDetails', 'POST', { itemId: provId });
        displayItem(provDetails, 'PROVIDER');
        console.log(`  Dependencies: [${provDependsOn.join(', ')}]`);
        console.log(`  Providers: [${provProvidesTo.join(', ')}]`);
      } catch (error) {
        console.log('');
        console.log('─'.repeat(80));
        console.log(`PROVIDER: ${provId}`);
        console.log('─'.repeat(80));
        console.log(`Error: ${error.message}`);
      }
    }
    const deptsDuration = Date.now() - deptsStartTime;
    if (VERBOSE) console.error(`[CLI] Fetched ${providerNodes.length} providers via daemon (${deptsDuration}ms)`);
  } else {
    console.log('');
    console.log('═'.repeat(80));
    console.log('PROVIDERS');
    console.log('═'.repeat(80));
    console.log('No providers');
  }

  console.log('');
  console.log('═'.repeat(80));
  console.log('');

  const totalDuration = Date.now() - totalStartTime;
  if (VERBOSE) console.error(`[CLI] Inspect command completed (${totalDuration}ms total)`);
}
