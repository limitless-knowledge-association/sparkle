/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Git Branch Operations - Manages the Sparkle branch via git worktree
 * Handles all git operations without disrupting the user's working directory
 */

import { execAsync } from './execUtils.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';

// Observer pattern for git availability
let gitAvailabilityCallback = null;

/**
 * Register a callback to be notified of git availability changes
 * @param {Function} callback - Function called with (available: boolean)
 */
export function onGitAvailabilityChange(callback) {
  gitAvailabilityCallback = callback;
}

/**
 * Notify observer of git availability status
 * @param {boolean} available - Whether git remote is available
 * @param {string} reason - Reason code for the status
 * @param {string} details - Optional additional details (e.g., error message)
 */
function notifyGitAvailability(available, reason = 'unknown', details = null) {
  if (gitAvailabilityCallback) {
    gitAvailabilityCallback(available, reason, details);
  }
}

/**
 * Get the git root directory
 * @param {string} [cwd=process.cwd()] - Starting directory
 * @returns {Promise<string>} Git root directory path
 */
export async function getGitRoot(cwd = process.cwd()) {
  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Not a git repository: ${error.message}`);
  }
}

/**
 * Check if git remote origin exists and is accessible
 * @param {string} gitRoot - Git repository root
 * @returns {Promise<{exists: boolean, isAccessible: boolean, error: string|null}>}
 */
export async function checkOriginRemote(gitRoot) {
  try {
    // Check if origin remote exists
    const { stdout } = await execAsync('git remote', { cwd: gitRoot });
    const hasOrigin = stdout.split('\n').includes('origin');

    if (!hasOrigin) {
      return { exists: false, isAccessible: false, error: 'No git remote "origin" found. Please add a remote: git remote add origin <url>' };
    }

    // Check if we can access origin and it has branches
    try {
      const { stdout: lsOutput } = await execAsync('git ls-remote --heads origin', { cwd: gitRoot, timeout: 30000 });

      // Check if origin has any branches
      if (!lsOutput.trim()) {
        return {
          exists: true,
          isAccessible: false,
          error: 'Origin remote has no branches. Please push at least one commit: git push -u origin main'
        };
      }

      return { exists: true, isAccessible: true, error: null };
    } catch (error) {
      return {
        exists: true,
        isAccessible: false,
        error: 'Cannot access origin remote. Please ensure the remote URL is correct and you have network connectivity.'
      };
    }
  } catch (error) {
    return { exists: false, isAccessible: false, error: error.message };
  }
}

/**
 * Get the default branch name from origin
 * @param {string} gitRoot - Git repository root
 * @returns {Promise<string>} Default branch name (e.g., 'main' or 'master')
 */
export async function getDefaultBranch(gitRoot) {
  try {
    const { stdout } = await execAsync('git remote show origin', { cwd: gitRoot });
    const match = stdout.match(/HEAD branch: (.+)/);
    if (!match) {
      throw new Error('Could not determine default branch');
    }
    const headBranch = match[1].trim();

    // Handle bare repos that don't have symbolic HEAD set
    if (headBranch === '(unknown)') {
      // Fallback: use the current branch
      const { stdout: currentBranch } = await execAsync('git branch --show-current', { cwd: gitRoot });
      const branch = currentBranch.trim();
      if (!branch) {
        throw new Error('Could not determine default branch (detached HEAD or unknown)');
      }
      return branch;
    }

    return headBranch;
  } catch (error) {
    throw new Error(`Failed to get default branch: ${error.message}`);
  }
}

/**
 * Get the latest commit SHA from origin default branch
 * @param {string} gitRoot - Git repository root
 * @returns {Promise<string>} Commit SHA
 */
export async function getLatestOriginCommit(gitRoot) {
  try {
    // Fetch first to ensure we have latest
    await execAsync('git fetch origin', { cwd: gitRoot });

    const defaultBranch = await getDefaultBranch(gitRoot);
    const { stdout } = await execAsync(`git rev-parse origin/${defaultBranch}`, { cwd: gitRoot });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get latest origin commit: ${error.message}`);
  }
}

/**
 * Check if a branch exists locally or remotely
 * @param {string} gitRoot - Git repository root
 * @param {string} branchName - Branch name to check
 * @returns {Promise<{local: boolean, remote: boolean}>}
 */
export async function branchExists(gitRoot, branchName) {
  let local = false;
  let remote = false;

  try {
    await execAsync(`git rev-parse --verify ${branchName}`, { cwd: gitRoot });
    local = true;
  } catch (error) {
    // Branch doesn't exist locally
  }

  try {
    await execAsync(`git rev-parse --verify origin/${branchName}`, { cwd: gitRoot });
    remote = true;
  } catch (error) {
    // Branch doesn't exist remotely
  }

  return { local, remote };
}

/**
 * Create a new branch from a specific commit without checking it out
 * @param {string} gitRoot - Git repository root
 * @param {string} branchName - Name of new branch
 * @param {string} commitSHA - Commit to branch from
 */
export async function createBranch(gitRoot, branchName, commitSHA) {
  try {
    await execAsync(`git branch ${branchName} ${commitSHA}`, { cwd: gitRoot });
  } catch (error) {
    throw new Error(`Failed to create branch ${branchName}: ${error.message}`);
  }
}

/**
 * Configure sparse checkout for the worktree to only check out specified directory
 * @param {string} worktreePath - Absolute path to worktree
 * @param {string} sparkleDir - Directory to check out (e.g., 'sparkle-data')
 */
async function configureSparseCheckout(worktreePath, sparkleDir) {
  try {
    // Check if sparse checkout is already configured correctly
    let needsConfig = false;

    try {
      const { stdout } = await execAsync('git sparse-checkout list', { cwd: worktreePath });
      const currentDirs = stdout.trim().split('\n').map(d => d.trim());

      // Check if the correct directory is configured
      if (currentDirs.length !== 1 || currentDirs[0] !== sparkleDir) {
        needsConfig = true;
      }
    } catch (error) {
      // Sparse checkout not initialized or command failed
      needsConfig = true;
    }

    // Only configure if needed
    if (needsConfig) {
      // Enable sparse checkout in cone mode (more efficient)
      await execAsync('git sparse-checkout init --cone', { cwd: worktreePath });

      // Set the directory to check out
      await execAsync(`git sparse-checkout set ${sparkleDir}`, { cwd: worktreePath });
    }
  } catch (error) {
    throw new Error(`Failed to configure sparse checkout: ${error.message}`);
  }
}

/**
 * Setup git worktree for Sparkle branch
 * @param {string} gitRoot - Git repository root
 * @param {string} branchName - Sparkle branch name
 * @param {string} sparkleDir - Directory name within branch (e.g., 'sparkle-data')
 * @param {string} worktreePath - Path for worktree (typically .sparkle-worktree)
 * @returns {Promise<string>} Absolute path to worktree
 */
export async function setupWorktree(gitRoot, branchName, sparkleDir, worktreePath = '.sparkle-worktree') {
  const fullWorktreePath = join(gitRoot, worktreePath);

  // Check if worktree already exists
  const worktreeExists = existsSync(fullWorktreePath);

  if (!worktreeExists) {
    // Check if the branch exists locally or remotely (without fetching first)
    let exists = await branchExists(gitRoot, branchName);

    // Only fetch if we suspect the branch might exist remotely
    // This avoids hanging during initial setup when remote doesn't have the branch yet
    if (!exists.local && !exists.remote) {
      // Branch doesn't exist anywhere yet - skip fetch to avoid hanging
      // This is the initial setup case where the branch will be created shortly
    } else if (exists.local && !exists.remote) {
      // Branch exists locally but we haven't checked remote recently
      // Do a quick fetch to see if it's been pushed (with timeout to avoid hanging)
      try {
        await execAsync('git fetch origin', { cwd: gitRoot, timeout: 5000 });
        // Re-check after fetch
        exists = await branchExists(gitRoot, branchName);
      } catch (error) {
        // Fetch failed or timed out - continue with what we know
      }
    }

    // Create new worktree
    try {
      if (exists.remote) {
        // If branch exists on remote, create worktree tracking the remote branch
        // This ensures all clones use the same upstream branch
        await execAsync(`git worktree add --track -b ${branchName} ${worktreePath} origin/${branchName}`, { cwd: gitRoot });
      } else if (exists.local) {
        // If branch only exists locally (e.g., during initial setup), use local branch
        await execAsync(`git worktree add ${worktreePath} ${branchName}`, { cwd: gitRoot });
        // Set up tracking to origin if remote exists
        try {
          await execAsync(`git branch --set-upstream-to=origin/${branchName} ${branchName}`, { cwd: fullWorktreePath });
        } catch (error) {
          // Remote branch doesn't exist yet (normal during initial setup)
        }
      } else {
        // Branch doesn't exist at all - this should only happen during initial setup
        // The branch will be created elsewhere (in createBranch)
        throw new Error(`Branch ${branchName} does not exist. Please create it first.`);
      }
    } catch (error) {
      throw new Error(`Failed to setup worktree: ${error.message}`);
    }
  } else {
    // Worktree exists - check if it's properly tracking the remote branch
    let needsTracking = false;

    try {
      // Check if we have an upstream tracking branch configured
      const { stdout } = await execAsync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', { cwd: fullWorktreePath });
      const upstream = stdout.trim();

      // Check if we're tracking the correct remote branch
      if (upstream !== `origin/${branchName}`) {
        needsTracking = true;
      }
    } catch (error) {
      // No upstream configured at all
      needsTracking = true;
    }

    // Only set up tracking if needed
    if (needsTracking) {
      try {
        // Fetch to ensure remote branch exists
        await execAsync('git fetch origin', { cwd: fullWorktreePath });

        // Check if remote branch exists
        try {
          await execAsync(`git rev-parse origin/${branchName}`, { cwd: fullWorktreePath });
          // Remote tracking branch exists, set up tracking
          await execAsync(`git branch --set-upstream-to=origin/${branchName}`, { cwd: fullWorktreePath });
        } catch (error) {
          // Remote branch doesn't exist, that's okay
        }
      } catch (error) {
        // Fetch failed (offline), that's okay
      }
    }
  }

  // Configure sparse checkout (works for both new and existing worktrees)
  // This will automatically remove any files outside sparkleDir from the working directory
  await configureSparseCheckout(fullWorktreePath, sparkleDir);

  // Add worktree directory to .gitignore in main repository (if not already there)
  // This prevents the worktree from showing as untracked in the main working directory
  const gitignorePath = join(gitRoot, '.gitignore');
  const worktreeIgnoreEntry = `${worktreePath}/`;

  try {
    let gitignoreContent = '';
    try {
      gitignoreContent = await readFile(gitignorePath, 'utf8');
    } catch {
      // .gitignore doesn't exist, will create it
    }

    // Check if worktree is already in .gitignore
    if (!gitignoreContent.split('\n').includes(worktreeIgnoreEntry)) {
      // Add worktree to .gitignore
      const newContent = gitignoreContent ? `${gitignoreContent}\n${worktreeIgnoreEntry}\n` : `${worktreeIgnoreEntry}\n`;
      await writeFile(gitignorePath, newContent, 'utf8');
    }
  } catch (error) {
    // Non-fatal: .gitignore update failed, worktree will still work
    // User will just see it as untracked in main repo
  }

  return fullWorktreePath;
}

/**
 * Initialize Sparkle branch with directory and .gitignore
 * @param {string} worktreePath - Worktree absolute path
 * @param {string} sparkleDir - Directory name within the branch (relative path)
 * @returns {Promise<string>} Absolute path to Sparkle data directory
 */
export async function initializeSparkleDirectory(worktreePath, sparkleDir) {
  const sparklePath = join(worktreePath, sparkleDir);

  // Create directory
  await mkdir(sparklePath, { recursive: true });

  // Create .gitignore only if it doesn't exist (don't overwrite existing one)
  const gitignorePath = join(sparklePath, '.gitignore');
  if (!existsSync(gitignorePath)) {
    await writeFile(gitignorePath, '.aggregates/\nlast_port.data\n*.log\n', 'utf8');
  }

  return sparklePath;
}

/**
 * Commit and push changes in the worktree
 * @param {string} worktreePath - Worktree absolute path
 * @param {string} message - Commit message
 * @param {number} [retries=5] - Number of retry attempts for push conflicts
 */
export async function commitAndPush(worktreePath, message, retries = 5) {
  try {
    // Stage all changes
    await execAsync('git add -A', { cwd: worktreePath });

    // Check if there are changes to commit
    try {
      await execAsync('git diff --cached --quiet', { cwd: worktreePath });
      // No changes to commit
      return;
    } catch (error) {
      // There are changes, proceed with commit
    }

    // Commit locally (always succeeds if there are changes)
    await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: worktreePath });

    // Push with retries
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await execAsync('git push origin HEAD', { cwd: worktreePath });
        // Push succeeded - git is available
        notifyGitAvailability(true, 'push-success');
        return;
      } catch (pushError) {
        if (attempt < retries - 1) {
          // Fetch and try to merge
          await execAsync('git fetch origin', { cwd: worktreePath });
          try {
            // Get current branch for Windows compatibility
            const { stdout: branchName } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath });
            await execAsync(`git merge origin/${branchName.trim()} --no-edit`, { cwd: worktreePath });
          } catch (mergeError) {
            throw new Error(`Merge conflict during push retry: ${mergeError.message}`);
          }

          // Wait with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        } else {
          // All retries exhausted - git is unavailable
          notifyGitAvailability(false, 'push-failed', pushError.message);
          throw new Error(`Failed to push after ${retries} attempts: ${pushError.message}`);
        }
      }
    }
  } catch (error) {
    // Commit succeeded locally, but push failed (or merge conflict)
    // This is normal when offline - the commit is safe locally
    notifyGitAvailability(false, 'push-failed', error.message);
    throw new Error(`Failed to commit and push: ${error.message}`);
  }
}

/**
 * Fetch updates from origin
 * @param {string} worktreePath - Worktree absolute path
 * @returns {Promise<{changed: boolean, sha: string}>} Whether changes were fetched and current SHA
 */
export async function fetchUpdates(worktreePath) {
  try {
    // Get current local HEAD SHA
    const { stdout: localSHA } = await execAsync('git rev-parse HEAD', { cwd: worktreePath });

    // Get current remote tracking branch SHA (before fetch)
    // Split into two commands for Windows compatibility (cmd.exe doesn't support $(...) substitution)
    const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath });
    const { stdout: beforeSHA } = await execAsync(`git rev-parse origin/${currentBranch.trim()}`, { cwd: worktreePath });

    // Fetch
    await execAsync('git fetch origin', { cwd: worktreePath });

    // Get new remote tracking branch SHA (after fetch)
    const branch = currentBranch.trim();
    const { stdout: afterSHA } = await execAsync(`git rev-parse origin/${branch}`, { cwd: worktreePath });

    const remoteChanged = beforeSHA.trim() !== afterSHA.trim();
    const localBehind = localSHA.trim() !== afterSHA.trim();

    // Merge if either:
    // 1. Remote changed (new commits from other users/clones)
    // 2. Local is behind remote (this clone's worktree is out of sync)
    if (remoteChanged || localBehind) {
      await execAsync(`git merge origin/${branch} --no-edit`, { cwd: worktreePath });
    }

    // Fetch succeeded - git is available
    notifyGitAvailability(true, 'fetch-success');

    return {
      changed: remoteChanged || localBehind,
      sha: afterSHA.trim()
    };
  } catch (error) {
    // Fetch failed - git is unavailable (normal when offline)
    notifyGitAvailability(false, 'fetch-failed', error.message);
    throw new Error(`Failed to fetch updates: ${error.message}`);
  }
}

/**
 * Get current branch HEAD SHA
 * @param {string} worktreePath - Worktree absolute path
 * @returns {Promise<string>} Current HEAD SHA
 */
export async function getCurrentSHA(worktreePath) {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: worktreePath });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get current SHA: ${error.message}`);
  }
}

/**
 * Check if Sparkle branch exists in origin
 * @param {string} gitRoot - Git repository root
 * @param {string} branchName - Branch name to check
 * @returns {Promise<boolean>}
 */
export async function sparkleBranchExistsInOrigin(gitRoot, branchName) {
  try {
    await execAsync('git fetch origin', { cwd: gitRoot });
    await execAsync(`git rev-parse --verify origin/${branchName}`, { cwd: gitRoot });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Add entry to .gitignore in working directory
 * @param {string} gitRoot - Git repository root
 * @param {string} entry - Entry to add (e.g., '.sparkle-worktree/')
 */
export async function addToGitignore(gitRoot, entry) {
  const gitignorePath = join(gitRoot, '.gitignore');

  let content = '';
  if (existsSync(gitignorePath)) {
    content = await readFile(gitignorePath, 'utf8');
  }

  // Check if entry already exists
  const lines = content.split('\n');
  if (lines.some(line => line.trim() === entry)) {
    return; // Already present
  }

  // Add entry
  if (content && !content.endsWith('\n')) {
    content += '\n';
  }
  content += `${entry}\n`;

  await writeFile(gitignorePath, content, 'utf8');
}

/**
 * Complete initial setup of Sparkle worktree and branch
 *
 * This is the single entry point for initializing a git repo with Sparkle.
 * Takes a git repo without worktree/branch and returns a fully configured
 * worktree with branch and upstream tracking.
 *
 * Based on verified sequence from references/gitsetup/01-initial-setup.sh
 *
 * Steps performed:
 * 1. Create branch from current HEAD (or specified commit)
 * 2. Add worktree for the branch
 * 3. Configure sparse checkout (cone mode)
 * 4. Set sparse directory
 * 5. Create initial directory structure with sample data
 * 6. Add .aggregates/ to worktree's .gitignore
 * 7. Commit changes
 * 8. Push with -u flag to establish upstream tracking
 * 9. Add worktree directory to main repo's .gitignore
 * 10. Commit .gitignore in main repo
 *
 * @param {string} gitRoot - Git repository root directory
 * @param {string} branchName - Name of branch to create (e.g., 'sparkle')
 * @param {string} dataDirectory - Name of data directory (e.g., 'sparkle-data')
 * @param {string} [worktreeDir='.sparkle-worktree'] - Name of worktree directory
 * @param {string} [baseCommit] - Commit SHA to branch from (defaults to latest origin commit)
 * @returns {Promise<string>} Path to the worktree
 */
export async function initializeSparkleWorktree(gitRoot, branchName, dataDirectory, worktreeDir = '.sparkle-worktree', baseCommit = null) {
  const fullWorktreePath = join(gitRoot, worktreeDir);

  // Step 1: Get base commit (use provided or get latest from origin)
  const commitSHA = baseCommit || await getLatestOriginCommit(gitRoot);

  // Step 2: Create branch from the commit
  await createBranch(gitRoot, branchName, commitSHA);

  // Step 3: Add worktree for the local branch
  try {
    await execAsync(`git worktree add ${worktreeDir} ${branchName}`, { cwd: gitRoot });
  } catch (error) {
    throw new Error(`Failed to add worktree: ${error.message}`);
  }

  // Step 4: Configure sparse checkout (cone mode)
  await execAsync('git sparse-checkout init --cone', { cwd: fullWorktreePath });

  // Step 5: Set sparse directory
  await execAsync(`git sparse-checkout set ${dataDirectory}`, { cwd: fullWorktreePath });

  // Step 6: Create the data directory
  const dataPath = join(fullWorktreePath, dataDirectory);
  await mkdir(dataPath, { recursive: true });

  // Step 7: Create .gitignore in data directory
  // This ensures .gitignore exists in all clones and can be known present in all tests
  const gitignorePath = join(dataPath, '.gitignore');
  await writeFile(gitignorePath, '.aggregates/\nlast_port.data\n*.log\n', 'utf8');

  // Step 8: Commit in worktree
  await execAsync('git add -A', { cwd: fullWorktreePath });
  await execAsync(`git commit -m "Initialize ${dataDirectory}"`, { cwd: fullWorktreePath });

  // Step 10: Push with -u flag to establish upstream tracking
  try {
    await execAsync(`git push -u origin ${branchName}`, { cwd: fullWorktreePath });
    notifyGitAvailability(true, 'push-success');
  } catch (error) {
    notifyGitAvailability(false, 'push-failed', error.message);
    throw new Error(`Failed to push with upstream tracking: ${error.message}`);
  }

  // Step 11: Add worktree directory to main repo's .gitignore
  await addToGitignore(gitRoot, `${worktreeDir}/`);

  // Step 12: Commit .gitignore in main repo (if there are changes)
  try {
    await execAsync('git add .gitignore', { cwd: gitRoot });

    // Check if there are changes to commit
    try {
      await execAsync('git diff --cached --quiet', { cwd: gitRoot });
      // No changes to .gitignore
    } catch (error) {
      // There are changes, commit them
      await execAsync(`git commit -m "Add ${worktreeDir} to .gitignore"`, { cwd: gitRoot });

      // Push .gitignore change to main branch
      try {
        await execAsync('git push', { cwd: gitRoot });
      } catch (pushError) {
        // Non-fatal: .gitignore push failed (might be offline or no upstream)
        // The worktree is still functional
      }
    }
  } catch (error) {
    // Non-fatal: .gitignore commit failed
    // The worktree is still functional
  }

  return fullWorktreePath;
}
