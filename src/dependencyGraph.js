/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Dependency graph utilities for cycle detection and reverse lookups
 */

/**
 * Build a dependency graph from active dependencies
 * @param {Map<string, Set<string>>} activeDeps - Map of itemNeeding -> Set of itemsNeeded
 * @returns {Map<string, Set<string>>} The dependency graph
 */
function buildGraph(activeDeps) {
  return new Map(Array.from(activeDeps.entries()).map(([key, value]) => [key, new Set(value)]));
}

/**
 * Check if adding a dependency would create a cycle using DFS
 * @param {string} itemNeeding - Item that needs another
 * @param {string} itemNeeded - Item that is needed
 * @param {Map<string, Set<string>>} activeDeps - Current active dependencies (itemNeeding -> Set of itemsNeeded)
 * @returns {boolean} True if adding this dependency would create a cycle
 */
export function wouldCreateCycle(itemNeeding, itemNeeded, activeDeps) {
  // If itemNeeded depends on itemNeeding (directly or transitively), adding this would create a cycle
  // We need to check if there's a path from itemNeeded to itemNeeding

  const visited = new Set();
  const stack = [itemNeeded];

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === itemNeeding) {
      return true; // Found a path from itemNeeded back to itemNeeding
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    // Add all items that current depends on
    const deps = activeDeps.get(current);
    if (deps) {
      for (const dep of deps) {
        stack.push(dep);
      }
    }
  }

  return false;
}

/**
 * Get all items that depend on a given item (reverse dependencies)
 * @param {string} itemId - Item to find dependents of
 * @param {Map<string, Set<string>>} activeDeps - Current active dependencies (itemNeeding -> Set of itemsNeeded)
 * @returns {Set<string>} Set of items that depend on this item
 */
export function getItemsDependingOn(itemId, activeDeps) {
  const dependents = new Set();

  for (const [itemNeeding, itemsNeeded] of activeDeps.entries()) {
    if (itemsNeeded.has(itemId)) {
      dependents.add(itemNeeding);
    }
  }

  return dependents;
}

/**
 * Get all items that transitively depend on a given item (recursive reverse dependencies)
 * @param {string} itemId - Item to find all dependents of
 * @param {Map<string, Set<string>>} activeDeps - Current active dependencies
 * @returns {Set<string>} Set of all items that transitively depend on this item
 */
export function getAllItemsDependingOn(itemId, activeDeps) {
  const allDependents = new Set();
  const toProcess = [itemId];
  const processed = new Set();

  while (toProcess.length > 0) {
    const current = toProcess.pop();

    if (processed.has(current)) {
      continue;
    }

    processed.add(current);

    const directDependents = getItemsDependingOn(current, activeDeps);
    for (const dependent of directDependents) {
      allDependents.add(dependent);
      toProcess.push(dependent);
    }
  }

  return allDependents;
}
