/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Shared test helpers for Sparkle tests
 */

import * as sparkle from '../../src/sparkle.js';
import * as aggregateManager from '../../src/aggregateManager.js';
import { rebuildStatusesAggregate } from '../../src/statusesAggregate.js';
import { rebuildTakersAggregate } from '../../src/takersAggregate.js';
import { unit_test_setup } from '../helpers/test-helpers.js';

/**
 * Point the real Sparkle API at a fresh data directory for one test.
 *
 * These tests used to drive src/sparkle-class.js — a second, parallel implementation of
 * the same API that nothing in production imported. The daemon has always used the
 * src/sparkle.js MODULE, so the unit suite was verifying code no real caller ran, and the
 * two could drift apart silently. This helper now wires up the module the daemon uses,
 * with the real aggregate manager, so the tests exercise the production path.
 *
 * The returned value is the module namespace, so every existing `sparkle.createItem(...)`
 * call site keeps working unchanged.
 *
 * Note this is still GIT-FREE: no git scheduler is injected, so nothing commits or
 * pushes. All git remains owned by the daemon.
 *
 * @param {string} testName - Name of the test
 * @returns {Promise<typeof sparkle>} The configured Sparkle API
 */
export async function setupSparkle(testName = 'unknown') {
  const testDir = await unit_test_setup(import.meta.url, testName);

  sparkle.setBaseDirectory(testDir);
  sparkle.setAggregateManager(aggregateManager);
  // No git scheduler: leaving it null keeps these tests off git entirely.
  sparkle.setGitScheduler(null);

  await aggregateManager.initializeAggregateStore(testDir);

  // Matches what the daemon does at startup, and what the old class's start() did.
  await rebuildStatusesAggregate(testDir);
  await rebuildTakersAggregate(testDir);

  return sparkle;
}

/**
 * Create a simple dependency chain: A -> B -> C
 * Returns { itemA, itemB, itemC }
 */
export async function createSimpleChain(sparkle) {
  const itemC = await sparkle.createItem('Item C');
  const itemB = await sparkle.createItem('Item B');
  await sparkle.addDependency(itemB, itemC);
  const itemA = await sparkle.createItem('Item A');
  await sparkle.addDependency(itemA, itemB);

  return { itemA, itemB, itemC };
}

/**
 * Create a diamond dependency structure:
 *     D
 *    / \
 *   B   C
 *    \ /
 *     A
 * Returns { itemA, itemB, itemC, itemD }
 */
export async function createDiamond(sparkle) {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');
  const itemD = await sparkle.createItem('Item D');

  await sparkle.addDependency(itemB, itemA);
  await sparkle.addDependency(itemC, itemA);
  await sparkle.addDependency(itemD, itemB);
  await sparkle.addDependency(itemD, itemC);

  return { itemA, itemB, itemC, itemD };
}

/**
 * Create a complex graph for testing:
 *     F
 *    / \
 *   D   E
 *   |\ /|
 *   | X |
 *   |/ \|
 *   B   C
 *    \ /
 *     A
 */
export async function createComplexGraph(sparkle) {
  const itemA = await sparkle.createItem('Item A');
  const itemB = await sparkle.createItem('Item B');
  const itemC = await sparkle.createItem('Item C');
  const itemD = await sparkle.createItem('Item D');
  const itemE = await sparkle.createItem('Item E');
  const itemF = await sparkle.createItem('Item F');

  // Bottom layer
  await sparkle.addDependency(itemB, itemA);
  await sparkle.addDependency(itemC, itemA);

  // Middle layer
  await sparkle.addDependency(itemD, itemB);
  await sparkle.addDependency(itemD, itemC);
  await sparkle.addDependency(itemE, itemB);
  await sparkle.addDependency(itemE, itemC);

  // Top layer
  await sparkle.addDependency(itemF, itemD);
  await sparkle.addDependency(itemF, itemE);

  return { itemA, itemB, itemC, itemD, itemE, itemF };
}
