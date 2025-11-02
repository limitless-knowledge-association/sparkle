/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Monitor Controller - handles monitor add/remove logic
 */

import { getItemDetails, createPersonData } from '../utils.js';
import { getItemFiles } from '../fileUtils.js';
import { hashObject } from '../nameUtils.js';
import * as monitorEvent from '../events/monitor.js';

/**
 * Add current user as a monitor for an item
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function addMonitor(baseDirectory, itemId, aggregateModel = null, gitOps = null) {
  // Verify item exists
  await getItemDetails(baseDirectory, itemId);

  const person = await createPersonData();
  const hash = hashObject({ name: person.name, email: person.email });

  // Check if already monitoring
  const files = await getItemFiles(baseDirectory, itemId);
  const monitorFiles = files.filter(f => f.filename.includes('.monitor.'));

  // Build current monitors to check if already active
  const monitors = new Map();
  for (const file of monitorFiles) {
    const parts = file.filename.split('.');
    if (parts[2] === 'added' || parts[2] === 'removed') {
      const fileHash = parts[3];
      const timestamp = parts[4];

      if (!monitors.has(fileHash)) {
        monitors.set(fileHash, []);
      }
      monitors.get(fileHash).push({
        action: parts[2],
        timestamp
      });
    }
  }

  // Check if this person is already actively monitoring
  if (monitors.has(hash)) {
    const events = monitors.get(hash);
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const latest = events[events.length - 1];

    if (latest.action === 'added') {
      return; // Already monitoring, ignore
    }
  }

  // Add monitor file using event handler
  const filename = await monitorEvent.createAddFile(baseDirectory, itemId, person);

  // Update aggregate if model provided
  if (aggregateModel) {
    const eventData = { person, hash };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}

/**
 * Remove current user as a monitor for an item
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} itemId - Item identifier
 * @param {Object} aggregateModel - AggregateModel instance for updating aggregates
 * @param {Object} gitOps - GitOperations instance for scheduling commits
 */
export async function removeMonitor(baseDirectory, itemId, aggregateModel = null, gitOps = null) {
  // Verify item exists
  await getItemDetails(baseDirectory, itemId);

  const person = await createPersonData();
  const hash = hashObject({ name: person.name, email: person.email });

  // Check if currently monitoring
  const files = await getItemFiles(baseDirectory, itemId);
  const monitorFiles = files.filter(f => f.filename.includes('.monitor.'));

  // Build current monitors
  const monitors = new Map();
  for (const file of monitorFiles) {
    const parts = file.filename.split('.');
    if (parts[2] === 'added' || parts[2] === 'removed') {
      const fileHash = parts[3];
      const timestamp = parts[4];

      if (!monitors.has(fileHash)) {
        monitors.set(fileHash, []);
      }
      monitors.get(fileHash).push({
        action: parts[2],
        timestamp
      });
    }
  }

  // Check if this person is currently monitoring
  if (monitors.has(hash)) {
    const events = monitors.get(hash);
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const latest = events[events.length - 1];

    if (latest.action === 'removed') {
      return; // Already not monitoring, ignore
    }
  } else {
    return; // Never monitored, ignore
  }

  // Add removal file using event handler
  const filename = await monitorEvent.createRemoveFile(baseDirectory, itemId, person);

  // Update aggregate if model provided
  if (aggregateModel) {
    const eventData = { person, hash };
    await aggregateModel.updateAggregateForEvent(filename, eventData);
  }

  // Notify git operations if provided
  if (gitOps) {
    gitOps.notifyFileCreated(filename);
  }
}
