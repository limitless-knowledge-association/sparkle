#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle Recovery Tool - Diagnoses and provides instructions to recover from
 * corrupted Sparkle worktree state
 *
 * This tool examines the git repository and Sparkle configuration, then provides
 * step-by-step instructions to clean up and recover. It does NOT execute any
 * commands automatically - it only provides guidance.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getGitRoot } from '../src/gitBranchOps.js';
import { execSyncWithOptions } from '../src/execUtils.js';

/**
 * Execute a git command and return output (or null on error)
 */
function gitCommand(cmd, options = {}) {
  try {
    return execSyncWithOptions(cmd, {
      encoding: 'utf8',
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    return null;
  }
}

/**
 * Normalize path for cross-platform comparison
 * Converts backslashes to forward slashes and handles case-insensitive comparison on Windows
 * @param {string} path - Path to normalize
 * @returns {string} Normalized path
 */
function normalizePath(path) {
  // Convert backslashes to forward slashes
  let normalized = path.replace(/\\/g, '/');

  // On Windows, paths are case-insensitive, so lowercase for comparison
  if (process.platform === 'win32') {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

/**
 * Check if a local branch exists
 */
function checkLocalBranch(branchName, gitRoot) {
  const output = gitCommand('git branch --list', { cwd: gitRoot });
  if (!output) return false;

  // Remove both * (current branch) and + (checked out in worktree) prefixes
  const branches = output.split('\n').map(b => b.trim().replace(/^[*+]\s*/, ''));
  return branches.includes(branchName);
}

/**
 * Check if a remote branch exists
 */
function checkRemoteBranch(branchName, gitRoot) {
  const output = gitCommand('git branch -r --list', { cwd: gitRoot });
  if (!output) return false;

  return output.includes(`origin/${branchName}`);
}

/**
 * Check for git reference lock issues in the worktree
 * Returns null if no issue, or an object with error details if there's a problem
 */
function checkGitRefLock(worktreePath, branchName) {
  if (!existsSync(worktreePath)) {
    return null; // Can't check if worktree doesn't exist
  }

  // Check what the local HEAD is at
  const localHead = gitCommand('git rev-parse HEAD', { cwd: worktreePath });
  if (!localHead) return null;

  // Check what git thinks the remote ref should be (what origin/branch resolves to)
  const actualRemoteRef = gitCommand(`git rev-parse origin/${branchName}`, { cwd: worktreePath });
  if (!actualRemoteRef) return null;

  // Get the git common directory (where refs are stored)
  // For worktrees, refs/remotes are in the common dir, not the worktree-specific dir
  const gitCommonDirOutput = gitCommand('git rev-parse --git-common-dir', { cwd: worktreePath });
  if (!gitCommonDirOutput) return null;

  // If it's an absolute path, use as-is; otherwise join with worktreePath
  const gitCommonDir = gitCommonDirOutput.startsWith('/') ? gitCommonDirOutput : join(worktreePath, gitCommonDirOutput);

  // Check what the remote ref file contains
  const remoteRefPath = join(gitCommonDir, 'refs', 'remotes', 'origin', branchName);
  if (!existsSync(remoteRefPath)) {
    return null; // No remote ref file yet
  }

  let storedRemoteRef;
  try {
    const { readFileSync } = require('fs');
    storedRemoteRef = readFileSync(remoteRefPath, 'utf8').trim();
  } catch (error) {
    return null;
  }

  // If they don't match, we have a ref lock issue
  if (storedRemoteRef !== actualRemoteRef) {
    return {
      localHead,
      storedRemoteRef,
      actualRemoteRef,
      branchName
    };
  }

  return null;
}

/**
 * Get list of worktrees
 */
function getWorktrees(gitRoot) {
  const output = gitCommand('git worktree list --porcelain', { cwd: gitRoot });
  if (!output) return [];

  const worktrees = [];
  const lines = output.split('\n');
  let current = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current.worktree) {
        worktrees.push(current);
      }
      current = { worktree: line.substring(9) };
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring(7);
    } else if (line.startsWith('detached')) {
      current.detached = true;
    } else if (line === '') {
      if (current.worktree) {
        worktrees.push(current);
        current = {};
      }
    }
  }

  if (current.worktree) {
    worktrees.push(current);
  }

  return worktrees;
}

/**
 * Main diagnostic and recovery function
 */
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('                      SPARKLE RECOVERY DIAGNOSTIC TOOL');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('This tool examines your Sparkle configuration and git state, then provides');
  console.log('step-by-step instructions to recover from any issues found.');
  console.log('');
  console.log('⚠️  NOTE: This tool DOES NOT execute any commands automatically.');
  console.log('   It only analyzes and provides instructions for you to review and execute.');
  console.log('');

  try {
    // Step 1: Load configuration
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: Loading Sparkle Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const gitRoot = await getGitRoot();
    console.log(`✓ Git root: ${gitRoot}`);

    const packageJsonPath = join(gitRoot, 'package.json');
    if (!existsSync(packageJsonPath)) {
      console.error('✗ package.json not found');
      process.exit(1);
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    if (!packageJson.sparkle_config) {
      console.error('✗ No sparkle_config found in package.json');
      console.error('');
      console.error('Sparkle is not configured in this repository.');
      console.error('You need to install and configure Sparkle first.');
      process.exit(1);
    }

    const config = packageJson.sparkle_config;
    const branchName = config.git_branch;
    const worktreePath = config.worktree_path || '.sparkle-worktree';
    const dataDirectory = config.directory;

    console.log(`✓ Configuration loaded:`);
    console.log(`  - Branch: ${branchName}`);
    console.log(`  - Worktree path: ${worktreePath}`);
    console.log(`  - Data directory: ${dataDirectory}`);
    console.log('');

    // Step 2: Check filesystem
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: Checking Filesystem');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const fullWorktreePath = join(gitRoot, worktreePath);
    const worktreeExists = existsSync(fullWorktreePath);
    const dataPath = join(fullWorktreePath, dataDirectory);
    const dataExists = existsSync(dataPath);

    console.log(`${worktreeExists ? '✓' : '✗'} Worktree directory exists: ${fullWorktreePath}`);
    if (worktreeExists) {
      console.log(`${dataExists ? '✓' : '✗'} Data directory exists: ${dataPath}`);
    }
    console.log('');

    // Step 3: Check git worktrees
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: Checking Git Worktrees');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const worktrees = getWorktrees(gitRoot);
    // Normalize paths for cross-platform comparison (Windows uses backslashes, git uses forward slashes)
    const normalizedWorktreePath = normalizePath(fullWorktreePath);
    const sparkleWorktree = worktrees.find(wt => normalizePath(wt.worktree) === normalizedWorktreePath);

    if (worktrees.length > 0) {
      console.log('Git worktrees found:');
      for (const wt of worktrees) {
        const branch = wt.detached ? '(detached)' : wt.branch;
        const isSparkle = normalizePath(wt.worktree) === normalizedWorktreePath ? ' ← SPARKLE' : '';
        console.log(`  - ${wt.worktree} [${branch}]${isSparkle}`);
      }
    } else {
      console.log('✗ No git worktrees registered');
    }
    console.log('');

    const worktreeRegistered = !!sparkleWorktree;
    console.log(`${worktreeRegistered ? '✓' : '✗'} Sparkle worktree registered in git`);
    console.log('');

    // Step 4: Check branches
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━���━━━━');
    console.log('STEP 4: Checking Git Branches');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const localBranchExists = checkLocalBranch(branchName, gitRoot);
    const remoteBranchExists = checkRemoteBranch(branchName, gitRoot);

    console.log(`${localBranchExists ? '✓' : '✗'} Local branch '${branchName}' exists`);
    console.log(`${remoteBranchExists ? '✓' : '✗'} Remote branch 'origin/${branchName}' exists`);
    console.log('');

    // Step 4.5: Check for git reference lock issues
    const refLockIssue = worktreeExists ? checkGitRefLock(fullWorktreePath, branchName) : null;

    // Step 5: Diagnosis and recommendations
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 5: Diagnosis and Recovery Instructions');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    let hasIssues = false;
    let stepNumber = 1;

    // Issue 0: Git reference lock conflict
    if (refLockIssue) {
      hasIssues = true;
      console.log(`⚠️  ISSUE: Git reference lock conflict detected`);
      console.log('');
      console.log(`   This is why Git is showing as offline in the Sparkle browser view.`);
      console.log('');
      console.log(`   Details:`);
      console.log(`   - Local HEAD is at:       ${refLockIssue.localHead.substring(0, 12)}`);
      console.log(`   - Stored remote ref:      ${refLockIssue.storedRemoteRef.substring(0, 12)}`);
      console.log(`   - Actual remote ref:      ${refLockIssue.actualRemoteRef.substring(0, 12)}`);
      console.log('');
      console.log(`   The stored remote-tracking reference for 'origin/${branchName}' is out of sync`);
      console.log(`   with what git expects it to be. This prevents 'git fetch' from working,`);
      console.log(`   causing Sparkle to report "Git is offline".`);
      console.log('');
      console.log(`   This can happen due to:`);
      console.log(`   - Interrupted git operations`);
      console.log(`   - Concurrent git operations`);
      console.log(`   - Force pushes to the remote branch`);
      console.log(`   - File system issues`);
      console.log('');
    }

    // Issue 1: Worktree registered but directory missing
    if (worktreeRegistered && !worktreeExists) {
      hasIssues = true;
      console.log(`⚠️  ISSUE: Git worktree is registered but directory doesn't exist`);
      console.log('');
      console.log(`${stepNumber}. Remove the worktree registration from git:`);
      console.log('');
      console.log(`   git worktree remove ${worktreePath}`);
      console.log('');
      console.log('   If that fails with an error, force removal:');
      console.log('');
      console.log(`   git worktree remove --force ${worktreePath}`);
      console.log('');
      stepNumber++;
    }

    // Issue 2: Worktree directory exists but not registered
    if (!worktreeRegistered && worktreeExists) {
      hasIssues = true;
      console.log(`⚠️  ISSUE: Worktree directory exists but is not registered in git`);
      console.log('');
      console.log(`${stepNumber}. Remove the worktree directory manually:`);
      console.log('');
      console.log(`   rm -rf ${worktreePath}`);
      console.log('');
      console.log('   (Review the directory contents first if you want to preserve any data)');
      console.log('');
      stepNumber++;
    }

    // Issue 3: Full cleanup when everything exists (normal state)
    if (worktreeRegistered && worktreeExists && localBranchExists) {
      hasIssues = true;
      console.log(`ℹ️  Complete cleanup instructions for full Sparkle reset:`);
      console.log('');
      console.log(`${stepNumber}. Remove the worktree:`);
      console.log('');
      console.log(`   git worktree remove ${worktreePath}`);
      console.log('');
      console.log('   If that fails (e.g., due to uncommitted changes), force removal:');
      console.log('');
      console.log(`   git worktree remove --force ${worktreePath}`);
      console.log('');
      console.log('   If force removal also fails, remove manually:');
      console.log('');
      console.log(`   rm -rf ${worktreePath}`);
      console.log(`   git worktree prune`);
      console.log('');
      stepNumber++;

      console.log(`${stepNumber}. Delete the local branch:`);
      console.log('');
      console.log(`   git branch -D ${branchName}`);
      console.log('');
      console.log('   This removes the local branch reference.');
      console.log(`   The remote branch 'origin/${branchName}' will remain intact.`);
      console.log('');
      stepNumber++;
    }
    // Issue 4: Partial cleanup scenarios
    else if (worktreeRegistered && worktreeExists && !localBranchExists) {
      hasIssues = true;
      console.log(`⚠️  ISSUE: Worktree exists but local branch is missing`);
      console.log('');
      console.log(`${stepNumber}. Remove the worktree:`);
      console.log('');
      console.log(`   git worktree remove ${worktreePath}`);
      console.log('');
      console.log('   Or force removal:');
      console.log('');
      console.log(`   git worktree remove --force ${worktreePath}`);
      console.log('');
      stepNumber++;
    }
    else if (localBranchExists && (!worktreeRegistered || !worktreeExists)) {
      hasIssues = true;
      console.log(`⚠️  ISSUE: Local branch '${branchName}' exists without a worktree`);
      console.log('');
      console.log(`${stepNumber}. Delete the local branch:`);
      console.log('');
      console.log(`   git branch -D ${branchName}`);
      console.log('');
      console.log('   This removes the local branch reference.');
      console.log(`   The remote branch 'origin/${branchName}' will remain intact.`);
      console.log('');
      stepNumber++;
    }

    // Issue 5: Remote branch missing
    if (!remoteBranchExists) {
      hasIssues = true;
      console.log(`⚠️  ISSUE: Remote branch 'origin/${branchName}' does not exist`);
      console.log('');
      console.log('   This is a serious issue. The Sparkle branch should exist on the remote.');
      console.log('   You may need to:');
      console.log('');
      console.log('   1. Check your remote configuration:');
      console.log('');
      console.log('      git remote -v');
      console.log('');
      console.log('   2. Fetch from origin to ensure you have the latest remote branches:');
      console.log('');
      console.log('      git fetch origin');
      console.log('');
      console.log('   3. Contact your team to verify the Sparkle branch exists on the remote.');
      console.log('');
      stepNumber++;
    }

    // Final instructions
    if (hasIssues) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('STEP 6: After Running Recovery Commands');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('Once you have executed the recovery commands above, restart Sparkle:');
      console.log('');
      console.log('   npx sparkle browser');
      console.log('');
      console.log('Sparkle will detect the missing worktree and automatically recreate it');
      console.log(`from the remote branch 'origin/${branchName}'.`);
      console.log('');
    } else {
      console.log('✓ No issues detected!');
      console.log('');
      console.log('Your Sparkle configuration appears to be healthy.');
      console.log('If you are experiencing issues, try:');
      console.log('');
      console.log('   npx sparkle halt');
      console.log('   npx sparkle browser');
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('✗ Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
