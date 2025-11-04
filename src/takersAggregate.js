/**
 * Takers Aggregate Builder
 * Rebuilds takers.json from taken event files using set semantics
 *
 * Once a person takes responsibility for any item, they are added to the
 * takers set and never removed (even if they surrender or take/surrender
 * multiple times).
 */

import { join } from 'path';
import { readdir } from 'fs/promises';
import { fileExists, readJsonFile, writeJsonFile } from './fileUtils.js';
import { hashObject } from './nameUtils.js';

/**
 * Rebuild the takers aggregate from all taken event files
 * @param {string} baseDirectory - Base directory (git root)
 * @returns {Promise<Array<Object>>} Array of unique takers [{name, email, hash}]
 */
export async function rebuildTakersAggregate(baseDirectory) {
  const dataDir = join(baseDirectory, '.sparkle-worktree', 'sparkle-data');
  const aggregatesDir = join(dataDir, '.aggregates');
  const aggregatePath = join(aggregatesDir, 'takers.json');

  // Find all taken event files (*.taken.taken.*.json or *.taken.surrendered.*.json)
  const allFiles = await readdir(dataDir).catch(() => []);
  const takenFiles = allFiles.filter(f =>
    f.includes('.taken.') && f.endsWith('.json')
  );

  // Parse and sort by timestamp to maintain chronological order
  const filesWithTimestamps = takenFiles.map(filename => {
    const parts = filename.split('.');
    // Format: itemId.taken.action.hash.timestamp.random.json
    const timestamp = parts[4] || '0';
    return { filename, timestamp };
  });

  filesWithTimestamps.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Use a Map keyed by hash to ensure uniqueness (set semantics)
  // We keep the first occurrence of each taker (earliest take)
  const takersMap = new Map();

  // Process each event in chronological order
  for (const { filename } of filesWithTimestamps) {
    const filePath = join(dataDir, filename);
    try {
      const eventData = await readJsonFile(filePath);

      // Extract person from event data
      if (eventData.person && eventData.person.name && eventData.person.email) {
        const person = eventData.person;
        const hash = hashObject({ name: person.name, email: person.email });

        // Add to set if not already present (set semantics - once added, never removed)
        if (!takersMap.has(hash)) {
          takersMap.set(hash, {
            name: person.name,
            email: person.email,
            hash: hash
          });
        }
      }
    } catch (error) {
      console.error(`Error processing taken event ${filename}:`, error.message);
      // Continue processing other files
    }
  }

  // Convert to array, sorted by name for consistent display
  const takers = Array.from(takersMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Write to aggregate file
  await writeJsonFile(aggregatePath, takers);

  console.log(`[takersAggregate] Rebuilt takers: ${takers.length} unique takers`);

  return takers;
}

/**
 * Add a taker to the aggregate (incremental update)
 * @param {string} baseDirectory - Base directory (git root)
 * @param {Object} person - Person data {name, email}
 * @returns {Promise<Array<Object>>} Updated array of takers
 */
export async function addTakerToAggregate(baseDirectory, person) {
  const dataDir = join(baseDirectory, '.sparkle-worktree', 'sparkle-data');
  const aggregatesDir = join(dataDir, '.aggregates');
  const aggregatePath = join(aggregatesDir, 'takers.json');

  const hash = hashObject({ name: person.name, email: person.email });

  // Read existing takers
  let takers = [];
  if (await fileExists(aggregatePath)) {
    try {
      takers = await readJsonFile(aggregatePath);
    } catch (error) {
      console.error('Error reading takers aggregate, will rebuild:', error.message);
      // Fall back to full rebuild
      return await rebuildTakersAggregate(baseDirectory);
    }
  }

  // Check if taker already exists
  const exists = takers.some(t => t.hash === hash);

  if (!exists) {
    // Add new taker
    takers.push({
      name: person.name,
      email: person.email,
      hash: hash
    });

    // Sort by name
    takers.sort((a, b) => a.name.localeCompare(b.name));

    // Write updated list
    await writeJsonFile(aggregatePath, takers);

    console.log(`[takersAggregate] Added new taker: ${person.name} (${person.email})`);
  }

  return takers;
}
