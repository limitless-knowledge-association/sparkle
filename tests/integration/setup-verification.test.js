#!/usr/bin/env node

/**
 * Setup Verification Test
 *
 * Tests the two critical setup paths:
 * 1. setupFirstCloneForSparkle - First clone creates sparkle branch
 * 2. enableSparkleInLaterClone - Later clones use existing branch from origin
 *
 * Verifies that both paths result in proper:
 * - Sparkle branch existence
 * - Upstream tracking configuration
 * - Sparse checkout setup
 */

import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { mkdir, rm, writeFile, readFile, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const execAsync = promisify(execCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the functions we need from src
import {
  setupWorktree,
  createBranch,
  initializeSparkleDirectory,
  addToGitignore,
  commitAndPush,
  getLatestOriginCommit,
  sparkleBranchExistsInOrigin
} from '../src/gitBranchOps.js';

/**
 * Setup first clone for Sparkle - mirrors what daemon does for new install
 * This is the path when sparkle branch doesn't exist yet
 */
async function setupFirstCloneForSparkle(clonePath, tarballPath) {
  console.log(`\n📦 Setting up first clone: ${clonePath}`);

  const git_branch = 'sparkle';
  const directory = 'sparkle-data';

  // 1. Copy tarball and commit it (so other clones can get it)
  console.log('  1. Copying and committing tarball...');
  await copyFile(tarballPath, join(clonePath, 'sparkle-1.0.153.tgz'));
  await execAsync('git add sparkle-1.0.153.tgz', { cwd: clonePath });
  await execAsync('git commit -m "Add Sparkle tarball"', { cwd: clonePath });
  await execAsync('git push', { cwd: clonePath });

  // 2. Initialize package.json with sparkle_config
  console.log('  2. Creating package.json with sparkle_config...');
  const packageJson = {
    "name": "test-project",
    "version": "1.0.0",
    "sparkle_config": {
      "git_branch": git_branch,
      "directory": directory
    },
    "dependencies": {
      "sparkle": "file:sparkle-1.0.153.tgz"
    }
  };
  await writeFile(join(clonePath, 'package.json'), JSON.stringify(packageJson, null, 2));

  // 3. Create .sparkle-autoconfig (triggers postinstall)
  console.log('  3. Creating .sparkle-autoconfig...');
  await writeFile(join(clonePath, '.sparkle-autoconfig'), '');

  // 4. Run npm install
  console.log('  4. Running npm install...');
  await execAsync('npm install', { cwd: clonePath });

  // 5. Commit package files
  console.log('  5. Committing package files...');
  await execAsync('git add package.json package-lock.json .sparkle-autoconfig', { cwd: clonePath });
  await execAsync('git commit -m "Configure Sparkle"', { cwd: clonePath });
  await execAsync('git push', { cwd: clonePath });

  // 6. Create sparkle branch from current main HEAD
  console.log('  6. Creating sparkle branch...');
  const baseCommit = await getLatestOriginCommit(clonePath);
  await createBranch(clonePath, git_branch, baseCommit);

  // 7. Setup worktree (this will create the worktree directory)
  console.log('  7. Setting up worktree...');
  const worktreePath = await setupWorktree(clonePath, git_branch, directory);

  // 8. Initialize sparkle directory
  console.log('  8. Initializing sparkle directory...');
  await initializeSparkleDirectory(worktreePath, directory);

  // 9. Add .aggregates/ to worktree's .gitignore
  console.log('  9. Adding .aggregates/ to worktree .gitignore...');
  await addToGitignore(worktreePath, '.aggregates/');

  // 10. Commit and push sparkle branch
  console.log('  10. Committing and pushing sparkle branch...');
  await commitAndPush(worktreePath, 'Initialize Sparkle branch');

  // 10b. Set up tracking branch (commitAndPush doesn't do this)
  console.log('  10b. Setting up upstream tracking...');
  await execAsync(`git branch --set-upstream-to=origin/${git_branch}`, { cwd: worktreePath });

  // 11. Add .sparkle-worktree to main repo .gitignore
  console.log('  11. Adding .sparkle-worktree/ to main .gitignore...');
  await addToGitignore(clonePath, '.sparkle-worktree/');

  console.log('  ✅ First clone setup complete');
  return worktreePath;
}

/**
 * Enable Sparkle in later clone - mirrors what daemon does when branch exists
 * This is the path when sparkle branch already exists in origin
 */
async function enableSparkleInLaterClone(clonePath) {
  console.log(`\n📥 Enabling Sparkle in later clone: ${clonePath}`);

  // 1. Pull to get package.json with sparkle_config
  console.log('  1. Pulling from origin...');
  await execAsync('git pull', { cwd: clonePath });

  // 2. Read config from package.json
  console.log('  2. Reading sparkle_config from package.json...');
  const packageJsonPath = join(clonePath, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const { git_branch, directory } = packageJson.sparkle_config || {};

  if (!git_branch || !directory) {
    throw new Error('No sparkle_config found in package.json');
  }
  console.log(`     Config: branch=${git_branch}, directory=${directory}`);

  // 3. Run npm install (gets sparkle from tarball in repo)
  console.log('  3. Running npm install...');
  await execAsync('npm install', { cwd: clonePath });

  // 4. Check if sparkle branch exists in origin
  console.log('  4. Checking if sparkle branch exists in origin...');
  const branchExists = await sparkleBranchExistsInOrigin(clonePath, git_branch);
  if (!branchExists) {
    throw new Error(`Branch ${git_branch} not found in origin`);
  }
  console.log('     Sparkle branch found in origin');

  // 5. Fetch sparkle branch
  console.log('  5. Fetching sparkle branch from origin...');
  await execAsync(`git fetch origin ${git_branch}`, { cwd: clonePath });

  // 6. Setup worktree (will detect branch exists in origin and set up tracking)
  console.log('  6. Setting up worktree with tracking...');
  const worktreePath = await setupWorktree(clonePath, git_branch, directory);

  // 7. Add .sparkle-worktree to .gitignore
  console.log('  7. Adding .sparkle-worktree/ to .gitignore...');
  await addToGitignore(clonePath, '.sparkle-worktree/');

  console.log('  ✅ Later clone setup complete');
  return worktreePath;
}

/**
 * Verify git configuration is correct
 */
async function verifyGitSetup(clonePath, cloneName) {
  console.log(`\n🔍 Verifying ${cloneName}...`);

  const worktreePath = join(clonePath, '.sparkle-worktree');

  // Check 1: Sparkle branch exists
  try {
    const { stdout } = await execAsync('git branch', { cwd: worktreePath });
    if (!stdout.includes('sparkle')) {
      throw new Error('Sparkle branch not found');
    }
    console.log('  ✓ Sparkle branch exists');
  } catch (error) {
    console.error('  ✗ Sparkle branch check failed:', error.message);
    return false;
  }

  // Check 2: Upstream tracking configured
  try {
    const { stdout } = await execAsync('git branch -vv', { cwd: worktreePath });
    if (!stdout.includes('[origin/sparkle]')) {
      console.error('  ✗ Upstream tracking NOT configured');
      console.error('    Current branch info:', stdout.trim());
      return false;
    }
    console.log('  ✓ Upstream tracking configured to origin/sparkle');
  } catch (error) {
    console.error('  ✗ Upstream tracking check failed:', error.message);
    return false;
  }

  // Check 3: Sparse checkout configured
  try {
    const { stdout } = await execAsync('git sparse-checkout list', { cwd: worktreePath });
    if (!stdout.includes('sparkle-data')) {
      throw new Error('Sparse checkout not configured for sparkle-data');
    }
    console.log('  ✓ Sparse checkout configured for sparkle-data');
  } catch (error) {
    console.error('  ✗ Sparse checkout check failed:', error.message);
    return false;
  }

  // Check 4: Can fetch from origin
  try {
    await execAsync('git fetch origin', { cwd: worktreePath });
    console.log('  ✓ Can fetch from origin');
  } catch (error) {
    console.error('  ✗ Fetch from origin failed:', error.message);
    return false;
  }

  // Check 5: Can pull from upstream
  try {
    await execAsync('git pull --no-edit', { cwd: worktreePath });
    console.log('  ✓ Can pull from upstream');
  } catch (error) {
    console.error('  ✗ Pull from upstream failed:', error.message);
    return false;
  }

  return true;
}

/**
 * Create test environment
 */
async function createTestEnvironment(baseDir) {
  console.log('\n🏗️  Creating test environment...');

  // Clean up old test
  if (existsSync(baseDir)) {
    await rm(baseDir, { recursive: true, force: true });
  }
  await mkdir(baseDir, { recursive: true });

  // Create bare repo
  const repoPath = join(baseDir, 'repo.git');
  await execAsync(`git init --bare ${repoPath}`);
  console.log('  Created bare repo:', repoPath);

  // Create clone1
  const clone1Path = join(baseDir, 'clone1');
  await execAsync(`git clone ${repoPath} ${clone1Path}`);

  // Initial commit in clone1
  await writeFile(join(clone1Path, 'README.md'), '# Test Project\n');
  await execAsync('git add README.md', { cwd: clone1Path });
  await execAsync('git commit -m "Initial commit"', { cwd: clone1Path });
  await execAsync('git push -u origin main', { cwd: clone1Path });
  console.log('  Created clone1 with initial commit');

  // Create clone2
  const clone2Path = join(baseDir, 'clone2');
  await execAsync(`git clone ${repoPath} ${clone2Path}`);
  console.log('  Created clone2');

  return {
    repoPath,
    clone1Path,
    clone2Path
  };
}

/**
 * Main test runner
 */
async function run() {
  console.log('======================================================================');
  console.log('Setup Verification Test');
  console.log('======================================================================\n');

  const baseDir = join(process.cwd(), '.integration_testing', 'setup-verification');
  const tarballPath = join(process.cwd(), 'sparkle-1.0.153.tgz');

  try {
    // Create test environment
    const { clone1Path, clone2Path } = await createTestEnvironment(baseDir);

    // Test 1: Setup first clone
    console.log('\n📋 Test 1: Setup First Clone');
    console.log('─'.repeat(70));
    await setupFirstCloneForSparkle(clone1Path, tarballPath);
    const clone1Valid = await verifyGitSetup(clone1Path, 'Clone 1');

    if (!clone1Valid) {
      console.error('\n❌ Clone 1 verification FAILED');
      process.exit(1);
    }
    console.log('\n✅ Clone 1 verification PASSED');

    // Test 2: Enable sparkle in later clone
    console.log('\n📋 Test 2: Enable Sparkle in Later Clone');
    console.log('─'.repeat(70));
    await enableSparkleInLaterClone(clone2Path);
    const clone2Valid = await verifyGitSetup(clone2Path, 'Clone 2');

    if (!clone2Valid) {
      console.error('\n❌ Clone 2 verification FAILED');
      process.exit(1);
    }
    console.log('\n✅ Clone 2 verification PASSED');

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('✅ ALL VERIFICATION TESTS PASSED');
    console.log('='.repeat(70));
    console.log('\nTest artifacts available at:', baseDir);
    console.log('  - Clone 1:', clone1Path);
    console.log('  - Clone 2:', clone2Path);
    console.log('');

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}

export { setupFirstCloneForSparkle, enableSparkleInLaterClone, verifyGitSetup };
