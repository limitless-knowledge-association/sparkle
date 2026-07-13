/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Git Commit Scheduler
 *
 * Single outbound-git policy, shared by every mutation in the daemon:
 *   - COMMIT immediately (local, always safe, works offline). The mutation is durable
 *     the moment scheduleOutboundGit() resolves, so callers that await it "block until
 *     commit" without ever blocking on the network.
 *   - PUSH is debounced (~5s) and best-effort. Rapid mutations coalesce into one push;
 *     an offline/failed push is non-fatal and retried later.
 */

let pushTimer = null;
let commitCallback = null;
let pushCallback = null;

const PUSH_DEBOUNCE_MS = 5000;

/**
 * Set the immediate-commit callback (async). Called synchronously (awaited) on every
 * mutation before the push is scheduled.
 * @param {Function} callback
 */
export function setCommitCallback(callback) {
  commitCallback = callback;
}

/**
 * Set the debounced-push callback (async). Called after the debounce window elapses.
 * @param {Function} callback
 */
export function setPushCallback(callback) {
  pushCallback = callback;
}

/**
 * Commit the just-written change immediately, then (re)arm the debounced push.
 * Called by the facade after every mutation. Awaiting this awaits the commit only.
 */
export async function scheduleOutboundGit() {
  // 1) Commit now — local and safe. Never let a commit failure escape to the caller;
  //    the mutation's files are already on disk regardless.
  if (commitCallback) {
    try {
      await commitCallback();
    } catch (error) {
      console.error('[gitCommitScheduler] Immediate commit failed:', error);
    }
  }

  // 2) Debounce the push so rapid mutations coalesce into a single best-effort push.
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    if (pushCallback) {
      try {
        await pushCallback();
      } catch (error) {
        console.error('[gitCommitScheduler] Debounced push failed:', error);
      }
    }
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Whether a push is currently pending (debounce timer armed).
 * @returns {boolean}
 */
export function isPushScheduled() {
  return pushTimer !== null;
}

/**
 * Cancel any pending push. Used during shutdown or testing.
 */
export function cancelScheduledPush() {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}
