/**
 * Statuses Aggregate Builder
 * Rebuilds statuses.json from status event files
 */

import { join } from 'path';
import { readdir } from 'fs/promises';
import { fileExists, readJsonFile, writeJsonFile } from './fileUtils.js';

/**
 * Rebuild the statuses aggregate from all status event files
 * @param {string} baseDirectory - Base directory (git root)
 * @returns {Promise<Array<string>>} Array of custom statuses (excluding 'incomplete' and 'completed')
 */
export async function rebuildStatusesAggregate(baseDirectory) {
  const dataDir = join(baseDirectory, '.sparkle-worktree', 'sparkle-data');
  const aggregatesDir = join(dataDir, '.aggregates');
  const aggregatePath = join(aggregatesDir, 'statuses.json');

  // Find all status event files
  const allFiles = await readdir(dataDir).catch(() => []);
  const statusFiles = allFiles.filter(f => f.startsWith('statuses.') && f.endsWith('.json'));

  // Parse and sort by timestamp
  const filesWithTimestamps = statusFiles.map(filename => {
    const parts = filename.split('.');
    // Format: statuses.<empty>.<timestamp>.<random>.json
    const timestamp = parts[2] || '0';
    return { filename, timestamp };
  });

  filesWithTimestamps.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Start with empty set (incomplete and completed are always added by getAllowedStatuses)
  const statusSet = new Set();

  // Apply each event in chronological order
  for (const { filename } of filesWithTimestamps) {
    const filePath = join(dataDir, filename);
    try {
      const eventData = await readJsonFile(filePath);

      // Check if this is old format (has 'statuses' array) or new format (has 'add'/'remove')
      if (eventData.statuses && Array.isArray(eventData.statuses)) {
        // Old format: treat all statuses as adds
        for (const status of eventData.statuses) {
          if (status !== 'incomplete' && status !== 'completed') {
            statusSet.add(status);
          }
        }
      } else {
        // New format: process adds and removes
        if (eventData.add && Array.isArray(eventData.add)) {
          for (const status of eventData.add) {
            if (status !== 'incomplete' && status !== 'completed') {
              statusSet.add(status);
            }
          }
        }

        if (eventData.remove && Array.isArray(eventData.remove)) {
          for (const status of eventData.remove) {
            // Remove if it exists (ignore silently if it doesn't)
            statusSet.delete(status);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing status event ${filename}:`, error.message);
      // Continue processing other files
    }
  }

  // Convert to sorted array
  const statuses = Array.from(statusSet).sort();

  // Write to aggregate file
  await writeJsonFile(aggregatePath, statuses);

  return statuses;
}
