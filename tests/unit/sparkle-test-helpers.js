/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Shared test helpers for Sparkle tests
 */

import { Sparkle } from '../../src/sparkle-class.js';
import { unit_test_setup } from '../helpers/test-helpers.js';

/**
 * Setup a fresh Sparkle instance for each test
 * @param {string} testName - Name of the test
 * @returns {Promise<Sparkle>} Initialized Sparkle instance
 */
export async function setupSparkle(testName = 'unknown') {
  const testDir = await unit_test_setup(import.meta.url, testName);
  const sparkle = new Sparkle(testDir);
  await sparkle.start();
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
