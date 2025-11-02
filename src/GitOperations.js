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

    // Debounced commit scheduling
    this.commitTimer = null;
    this.pendingFiles = new Set();
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
   * Notify that a file was created locally (schedules commit)
   * @param {string} filename - Event filename that was created
   */
  notifyFileCreated(filename) {
    this.pendingFiles.add(filename);
    this._scheduleCommit();
  }

  /**
   * Schedule a commit (debounced to 5 seconds)
   * @private
   */
  _scheduleCommit() {
    // Clear existing timer
    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
    }

    // Set new 5-second timer
    this.commitTimer = setTimeout(async () => {
      this.commitTimer = null;

      try {
        await this.commitAndPush();
      } catch (error) {
        console.error('[GitOperations] Commit and push failed:', error);
      }
    }, 5000);
  }

  /**
   * Cancel any pending commit
   */
  cancelPendingCommit() {
    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }
  }

  /**
   * Commit and push local changes with retry logic
   * Migrated from sparkle_agent.js performCommitAndFetch()
   * @returns {Promise<boolean>} True if successful
   */
  async commitAndPush() {
    const maxRetries = 5;
    const startTime = Date.now();

    try {
      // STEP 1: Fetch first to get latest remote state
      console.log('[GitOperations] Fetching latest changes...');
      await execAsync('git fetch origin', { cwd: this.baseDirectory });

      // STEP 2: Pull/merge any remote changes
      let pulledFiles = [];
      try {
        const { stdout } = await execAsync('git pull --no-edit --stat', { cwd: this.baseDirectory });
        console.log('[GitOperations] Merged remote changes');

        // Parse changed files from pull output
        pulledFiles = this._parseChangedFiles(stdout);

        if (pulledFiles.length > 0) {
          console.log(`[GitOperations] Pull detected ${pulledFiles.length} changed files`);
          // Notify callbacks about pulled files
          this._notifyFilesPulled(pulledFiles);
        }
      } catch (pullError) {
        // Pull might fail if there are uncommitted changes - that's ok
        console.log('[GitOperations] Pull skipped (uncommitted changes present)');
      }

      // STEP 3: Stage all JSON files in sparkle-data directory (if any exist)
      try {
        const { stdout: addOutput } = await execAsync('git add sparkle-data/*.json', { cwd: this.baseDirectory });
        // List what was actually staged
        const { stdout: stagedFiles } = await execAsync('git diff --cached --name-only', { cwd: this.baseDirectory });
        if (stagedFiles.trim()) {
          const fileList = stagedFiles.trim().split('\n');
          console.log(`[GitOperations] Staged ${fileList.length} file(s): ${fileList.join(', ')}`);
        }
      } catch (addError) {
        // No .json files to add - that's ok, might just be pulling
        console.log('[GitOperations] No item files to stage');
      }

      // STEP 4: Check if there are changes to commit
      try {
        await execAsync('git diff --cached --quiet', { cwd: this.baseDirectory });
        console.log('[GitOperations] No changes to commit');
        this.pendingFiles.clear();
        return true;
      } catch {
        // Has changes, continue to commit
      }

      // STEP 5: Commit locally
      const timestamp = new Date().toISOString();
      const { stdout: commitOutput } = await execAsync(`git commit -m "Auto-commit: ${timestamp}"`, { cwd: this.baseDirectory });
      console.log('[GitOperations] Local commit created');

      // Log commit details
      const { stdout: commitSha } = await execAsync('git rev-parse HEAD', { cwd: this.baseDirectory });
      console.log(`[GitOperations] Commit SHA: ${commitSha.trim()}`);

      // TEST HOOK: Allow tests to block push for race condition testing
      if (process.env.SPARKLE_TEST_BLOCK_PUSH === 'true') {
        const testIdMatch = process.argv.find(arg => arg.startsWith('--test-id='));
        if (testIdMatch) {
          const testId = testIdMatch.split('=')[1];
          const blockFile = `/tmp/sparkle-push-block-${testId}`;

          // Dynamic import to avoid issues in non-test environments
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

      // STEP 6: Push with retry loop for conflicts
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log(`[GitOperations] Attempting push (${attempt + 1}/${maxRetries})...`);
          const { stdout: pushOutput } = await execAsync('git push origin HEAD', { cwd: this.baseDirectory });

          // Push succeeded!
          const duration = Date.now() - startTime;
          console.log(`[GitOperations] Push successful (${duration}ms)`);

          // Log what was pushed (split for Windows compatibility)
          const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: this.baseDirectory });
          const { stdout: remoteSha } = await execAsync(`git rev-parse origin/${currentBranch.trim()}`, { cwd: this.baseDirectory });
          console.log(`[GitOperations] Remote now at: ${remoteSha.trim()}`);

          this.pendingFiles.clear();

          // Get current SHA and notify completion callback
          if (this.commitCompleteCallback) {
            try {
              const { stdout } = await execAsync('git rev-parse HEAD', { cwd: this.baseDirectory });
              const sha = stdout.trim();
              this.commitCompleteCallback({ success: true, sha });
            } catch (error) {
              // If we can't get SHA, still report success but without SHA
              this.commitCompleteCallback({ success: true });
            }
          }

          return true;

        } catch (pushError) {
          console.log(`[GitOperations] Push failed (attempt ${attempt + 1}): ${pushError.message}`);

          if (attempt < maxRetries - 1) {
            // Fetch latest and merge with ORT strategy
            console.log('[GitOperations] Fetching and merging remote changes...');

            try {
              await execAsync('git fetch origin', { cwd: this.baseDirectory });

              // Use --no-rebase to force ORT merge
              const { stdout } = await execAsync('git pull --no-rebase --no-edit --stat', {
                cwd: this.baseDirectory
              });

              console.log('[GitOperations] Merged remote changes, retrying push...');

              // Parse and notify about files from merge
              const mergedFiles = this._parseChangedFiles(stdout);
              if (mergedFiles.length > 0) {
                console.log(`[GitOperations] Merge brought ${mergedFiles.length} changed files`);
                this._notifyFilesPulled(mergedFiles);
              }

            } catch (mergeError) {
              console.error('[GitOperations] Merge failed:', mergeError.message);

              if (attempt === maxRetries - 1) {
                throw new Error(`Merge conflict after ${maxRetries} attempts`);
              }
            }

            // Exponential backoff before retry
            const backoffMs = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          } else {
            throw pushError;
          }
        }
      }

      return false;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[GitOperations] Commit and push failed after ${duration}ms:`, error.message);

      // Notify completion callback of failure
      if (this.commitCompleteCallback) {
        this.commitCompleteCallback({ success: false, error: error.message });
      }

      throw error;
    }
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
