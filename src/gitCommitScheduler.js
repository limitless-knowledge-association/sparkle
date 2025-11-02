/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Git Commit Scheduler - Debounced timer for batching git operations
 *
 * When event files are written, they call scheduleOutboundGit() which sets
 * a 5-second timer. If more events are written, the timer resets. When the
 * timer expires, it triggers a commit+fetch+push cycle.
 */

let outboundGitTimer = null;
let schedulerCallback = null;

/**
 * Set the callback function to execute when timer expires
 * Called by sparkle_agent.js during initialization
 * @param {Function} callback - async function to perform git operations
 */
export function setSchedulerCallback(callback) {
  schedulerCallback = callback;
}

/**
 * Schedule a git commit operation (debounced to 5 seconds)
 * Resets timer if already scheduled
 * Called by event files after writing
 */
export async function scheduleOutboundGit() {
  // Clear existing timer if present
  if (outboundGitTimer) {
    clearTimeout(outboundGitTimer);
  }

  // Set new 5-second timer
  outboundGitTimer = setTimeout(async () => {
    outboundGitTimer = null;

    if (schedulerCallback) {
      try {
        await schedulerCallback();
      } catch (error) {
        console.error('Git scheduler callback failed:', error);
      }
    }
  }, 5000);
}

/**
 * Check if git operation is currently scheduled
 * @returns {boolean}
 */
export function isGitScheduled() {
  return outboundGitTimer !== null;
}

/**
 * Cancel any pending git operation
 * Used during shutdown or testing
 */
export function cancelScheduledGit() {
  if (outboundGitTimer) {
    clearTimeout(outboundGitTimer);
    outboundGitTimer = null;
  }
}
