/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * GitOperations - Centralized git operations with event callbacks
 *
 * Manages git fetch/pull operations and notifies listeners when
 * new data has been fetched from the remote repository.
 */

import { execAsync } from './execUtils.js';

/**
 * GitOperations class - manages git operations with event notifications
 */
export class GitOperations {
  constructor(baseDirectory) {
    this.baseDirectory = baseDirectory;

    // Callbacks for pull events
    this.filesPulledCallbacks = [];

    // Callback for commit completion (daemon SSE broadcasts)
    this.commitCompleteCallback = null;

    // Serializes git operations so concurrent mutations never race on index.lock.
    this._gitChain = Promise.resolve();
  }

  /**
   * Register a callback to be called when files were pulled from remote
   * @param {Function} callback - Called with (filenames) array
   */
  onFilesPulled(callback) {
    this.filesPulledCallbacks.push(callback);
  }

  /**
   * Register a callback to be called when commit and push completes
   * @param {Function} callback - Called with ({success, sha?, error?})
   */
  onCommitComplete(callback) {
    this.commitCompleteCallback = callback;
  }

  /**
   * Notify all registered callbacks that files were pulled
   * @param {Array<string>} filenames - List of filenames that were pulled
   * @private
   */
  _notifyFilesPulled(filenames) {
    for (const callback of this.filesPulledCallbacks) {
      try {
        callback(filenames);
      } catch (error) {
        console.error('[GitOperations] Error in files pulled callback:', error);
      }
    }
  }

  /**
   * Run a git task after all previously-queued git tasks settle, so concurrent
   * mutations never overlap `git add`/`commit`/`push` (which would collide on
   * index.lock). The returned promise reflects this task's own outcome; the internal
   * chain continues regardless of success/failure.
   * @private
   */
  _serialize(task) {
    const result = this._gitChain.then(() => task(), () => task());
    this._gitChain = result.then(() => {}, () => {});
    return result;
  }

  /**
   * Commit staged sparkle-data changes to the local branch.
   *
   * This is a purely LOCAL operation: no fetch/pull/push, so it cannot fail because
   * the machine is offline. It is the always-safe, immediate unit of durability —
   * every mutation commits right away; pushing is a separate, best-effort concern.
   *
   * @returns {Promise<{committed: boolean, sha?: string}>}
   */
  async commit() {
    return this._serialize(() => this._commitLocal());
  }

  /** @private */
  async _commitLocal() {
    // Stage item files. The pathspec is relative to baseDirectory, which MUST be the
    // worktree root (the daemon always constructs GitOperations that way).
    try {
      await execAsync('git add sparkle-data/*.json', { cwd: this.baseDirectory });
    } catch (addError) {
      // No matching files to stage yet — fall through; the diff check handles it.
    }

    // Nothing staged -> nothing to commit.
    try {
      await execAsync('git diff --cached --quiet', { cwd: this.baseDirectory });
      return { committed: false };
    } catch {
      // Staged changes present -> commit.
    }

    const timestamp = new Date().toISOString();
    await execAsync(`git commit -m "Auto-commit: ${timestamp}"`, { cwd: this.baseDirectory });
    const { stdout: sha } = await execAsync('git rev-parse HEAD', { cwd: this.baseDirectory });
    console.log(`[GitOperations] Local commit ${sha.trim()}`);
    return { committed: true, sha: sha.trim() };
  }

  /**
   * Push local commits to origin. BEST-EFFORT and NON-THROWING.
   *
   * Fetches + merges remote first (incorporating others' commits) then pushes with a
   * bounded retry loop. Any failure — offline, unreachable remote, exhausted retries —
   * is logged and reported via onCommitComplete, but never thrown: the local commit is
   * already durable, and the push is retried later (debounce, or the next daemon start).
   *
   * Also used for startup reconciliation: it pulls remote changes and flushes any
   * commits that were stranded while offline.
   *
   * @returns {Promise<{pushed: boolean, error?: string}>}
   */
  async syncAndPush() {
    return this._serialize(() => this._syncAndPushInner());
  }

  /** @private */
  async _syncAndPushInner() {
    const maxRetries = 5;
    const startTime = Date.now();

    // TEST HOOK: allow tests to block the push (race-condition / offline simulation).
    if (process.env.SPARKLE_TEST_BLOCK_PUSH === 'true') {
      const testIdMatch = process.argv.find(arg => arg.startsWith('--test-id='));
      if (testIdMatch) {
        const testId = testIdMatch.split('=')[1];
        const blockFile = `/tmp/sparkle-push-block-${testId}`;
        const { existsSync } = await import('fs');
        if (existsSync(blockFile)) {
          console.log(`🧪 [GitOperations] TEST HOOK: Blocking push until ${blockFile} is removed`);
          while (existsSync(blockFile)) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          console.log('🧪 [GitOperations] TEST HOOK: Push unblocked, proceeding');
        }
      }
    }

    // Fetch + merge remote so our push is a fast-forward when possible.
    // Offline / nothing-to-pull is fine — proceed to attempt the push regardless.
    await this._fetchAndMerge();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await execAsync('git push origin HEAD', { cwd: this.baseDirectory });

        const { stdout: sha } = await execAsync('git rev-parse HEAD', { cwd: this.baseDirectory });
        console.log(`[GitOperations] Push successful (${Date.now() - startTime}ms), remote at ${sha.trim()}`);
        if (this.commitCompleteCallback) {
          this.commitCompleteCallback({ success: true, sha: sha.trim() });
        }
        return { pushed: true };

      } catch (pushError) {
        console.log(`[GitOperations] Push failed (attempt ${attempt + 1}/${maxRetries}): ${pushError.message}`);
        if (attempt < maxRetries - 1) {
          // A non-fast-forward can often be resolved by merging remote and retrying.
          // If the remote is unreachable (offline), stop retrying — push is deferred.
          const reachable = await this._fetchAndMerge();
          if (!reachable) break;
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    // Push did not complete. Best-effort: report and return; do NOT throw. The commit
    // is safe locally and will be pushed on the next mutation/debounce or daemon start.
    console.warn('[GitOperations] Push deferred (remote unreachable or conflicts); will retry later');
    if (this.commitCompleteCallback) {
      this.commitCompleteCallback({ success: false, error: 'push deferred' });
    }
    return { pushed: false, error: 'push deferred' };
  }

  /**
   * Fetch and merge remote changes (ORT, no rebase). Returns true if the remote was
   * reachable, false if it appears we are offline. Never throws.
   * @private
   */
  async _fetchAndMerge() {
    try {
      await execAsync('git fetch origin', { cwd: this.baseDirectory });
    } catch {
      return false; // remote unreachable -> offline
    }
    try {
      const { stdout } = await execAsync('git pull --no-rebase --no-edit --stat', { cwd: this.baseDirectory });
      const merged = this._parseChangedFiles(stdout);
      if (merged.length > 0) {
        console.log(`[GitOperations] Merged ${merged.length} remote change(s)`);
        this._notifyFilesPulled(merged);
      }
    } catch {
      // Merge conflict or nothing to merge; caller's push attempt will surface real issues.
    }
    return true;
  }

  /**
   * Convenience composition of the single git path: commit locally, then push.
   * Contains no independent logic of its own.
   * @returns {Promise<{pushed: boolean, error?: string}>}
   */
  async commitAndPush() {
    await this.commit();
    return this.syncAndPush();
  }


  /**
   * Parse git pull/fetch output to extract list of changed files
   * @param {string} output - Git command output
   * @returns {Array<string>} List of changed filenames
   * @private
   */
  _parseChangedFiles(output) {
    const files = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Match lines like " filename.json | 1 +"
      // or "filename.json | 1 +"
      const match = line.match(/^\s*(.+?)\s*\|\s*\d+/);
      if (match) {
        files.push(match[1].trim());
      }
    }

    return files;
  }

  /**
   * Extract all itemIds from an event filename
   * @param {string} filename - Event filename
   * @returns {Array<string>} Array of itemIds found in filename
   * @private
   */
  _extractItemIdsFromFilename(filename) {
    const itemIds = new Set();
    const parts = filename.split('.');

    // First part is always an itemId if it's an 8-digit number
    const firstPart = parts[0];
    if (/^\d{8}$/.test(firstPart)) {
      itemIds.add(firstPart);
    }

    // For dependency files: itemId.dependency.action.targetItemId.timestamp.random.json
    // The targetItemId is in position 3
    if (parts[1] === 'dependency' && parts.length >= 4) {
      const targetItemId = parts[3];
      if (/^\d{8}$/.test(targetItemId)) {
        itemIds.add(targetItemId);
      }
    }

    return Array.from(itemIds);
  }

  /**
   * Extract all itemIds from a list of changed files
   * @param {Array<string>} changedFiles - List of filenames
   * @returns {Array<string>} Array of unique itemIds
   * @private
   */
  _extractAllItemIds(changedFiles) {
    const allItemIds = new Set();

    for (const filename of changedFiles) {
      const itemIds = this._extractItemIdsFromFilename(filename);
      for (const itemId of itemIds) {
        allItemIds.add(itemId);
      }
    }

    return Array.from(allItemIds);
  }

  /**
   * Execute git pull and notify listeners if changes were pulled
   * @returns {Promise<{changesDetected: boolean, changedFiles: Array<string>, output: string}>}
   */
  async pull() {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync('git pull --stat', {
        cwd: this.baseDirectory
      });

      const output = stdout + stderr;
      const duration = Date.now() - startTime;

      // Check if git pull actually pulled new changes
      const alreadyUpToDate = output.includes('Already up to date') ||
                              output.includes('Already up-to-date');

      const changesDetected = !alreadyUpToDate;
      let changedFiles = [];

      if (changesDetected) {
        // Parse output to extract changed files
        changedFiles = this._parseChangedFiles(output);

        console.log(`[GitOperations] Pull completed: ${changedFiles.length} files (${duration}ms)`);

        // Notify listeners with changed files
        if (changedFiles.length > 0) {
          this._notifyFilesPulled(changedFiles);
        }
      } else {
        console.log(`[GitOperations] Pull completed - already up to date (${duration}ms)`);
      }

      return { changesDetected, changedFiles, output };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[GitOperations] Pull failed (${duration}ms):`, error.message);
      throw error;
    }
  }

  /**
   * Execute git fetch and notify listeners if changes were fetched
   * Note: fetch doesn't automatically show changed files like pull does
   * Caller should use pull or compare commits to get file list
   * @returns {Promise<{changesDetected: boolean, changedFiles: Array<string>, output: string}>}
   */
  async fetch() {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync('git fetch', {
        cwd: this.baseDirectory
      });

      const output = stdout + stderr;
      const duration = Date.now() - startTime;

      // If fetch output is empty or very short, likely nothing was fetched
      // When fetch gets new commits, it outputs something like:
      // "remote: Counting objects: 5, done."
      const changesDetected = output.trim().length > 0;
      const changedFiles = []; // fetch doesn't provide file list

      if (changesDetected) {
        console.log(`[GitOperations] Fetch completed with changes (${duration}ms)`);
        // For fetch, we don't know which specific files changed
        // Caller should use pull if they need to know affected itemIds
        // For now, don't notify (or could notify with empty array to signal "invalidate all")
      } else {
        console.log(`[GitOperations] Fetch completed - no changes (${duration}ms)`);
      }

      return { changesDetected, changedFiles, output };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[GitOperations] Fetch failed (${duration}ms):`, error.message);
      throw error;
    }
  }

  /**
   * Execute git push
   * @returns {Promise<string>} Output from git push
   */
  async push() {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync('git push', {
        cwd: this.baseDirectory
      });

      const duration = Date.now() - startTime;
      console.log(`[GitOperations] Push completed (${duration}ms)`);

      return stdout + stderr;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[GitOperations] Push failed (${duration}ms):`, error.message);
      throw error;
    }
  }
}
