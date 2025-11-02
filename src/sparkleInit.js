/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle Initialization Logic
 * Core initialization functions that can be used by daemon or tests
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  initializeSparkleWorktree
} from './gitBranchOps.js';

/**
 * Initialize Sparkle from scratch
 * This is the core initialization logic used by /api/configure
 * @param {string} gitRoot - Git repository root
 * @param {string} gitBranch - Branch name for sparkle
 * @param {string} directory - Data directory name
 */
export async function initializeSparkle(gitRoot, gitBranch, directory) {
  // Use the single entry point function that handles complete initialization
  const worktreePath = await initializeSparkleWorktree(gitRoot, gitBranch, directory);

  // Update package.json with config
  await updatePackageJson(gitRoot, { git_branch: gitBranch, directory });

  return worktreePath;
}

/**
 * Update package.json with sparkle_config
 * @param {string} gitRoot - Git repository root  
 * @param {object} sparkleConfig - Config object with git_branch and directory
 */
async function updatePackageJson(gitRoot, sparkleConfig) {
  const packageJsonPath = join(gitRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  
  packageJson.sparkle_config = sparkleConfig;
  
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
}
