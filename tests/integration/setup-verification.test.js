/**
 * Setup Verification Test (Jest version)
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
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(execCallback);

// Import the functions we need from src
import {
  setupWorktree,
  createBranch,
  initializeSparkleDirectory,
  addToGitignore,
  commitAndPush,
  getLatestOriginCommit,
  sparkleBranchExistsInOrigin
} from '../../src/gitBranchOps.js';

// Helper: Get tarball path for current version
async function getTarballPath() {
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  const tarballName = `sparkle-${version}.tgz`;
  return join(process.cwd(), tarballName);
}

/**
 * Setup first clone for Sparkle - mirrors what daemon does for new install
 * This is the path when sparkle branch doesn't exist yet
 */
async function setupFirstCloneForSparkle(clonePath, tarballPath, tarballName) {
  console.log(`\n📦 Setting up first clone: ${clonePath}`);

  const git_branch = 'sparkle';
  const directory = 'sparkle-data';

  // 1. Copy tarball and commit it (so other clones can get it)
  console.log('  1. Copying and committing tarball...');
  await copyFile(tarballPath, join(clonePath, tarballName));
  await execAsync(`git add ${tarballName}`, { cwd: clonePath });
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
      "sparkle": `file:${tarballName}`
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
  const { stdout: branchList } = await execAsync('git branch', { cwd: worktreePath });
  expect(branchList).toContain('sparkle');
  console.log('  ✓ Sparkle branch exists');

  // Check 2: Upstream tracking configured
  const { stdout: branchInfo } = await execAsync('git branch -vv', { cwd: worktreePath });
  expect(branchInfo).toContain('[origin/sparkle]');
  console.log('  ✓ Upstream tracking configured to origin/sparkle');

  // Check 3: Sparse checkout configured
  const { stdout: sparseCheckout } = await execAsync('git sparse-checkout list', { cwd: worktreePath });
  expect(sparseCheckout).toContain('sparkle-data');
  console.log('  ✓ Sparse checkout configured for sparkle-data');

  // Check 4: Can fetch from origin
  await execAsync('git fetch origin', { cwd: worktreePath });
  console.log('  ✓ Can fetch from origin');

  // Check 5: Can pull from upstream
  await execAsync('git pull --no-edit', { cwd: worktreePath });
  console.log('  ✓ Can pull from upstream');
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

describe('Sparkle Setup Verification', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'setup-verification');
  let tarballPath;
  let tarballName;
  let clone1Path;
  let clone2Path;

  beforeAll(async () => {
    // Get dynamic tarball path
    tarballPath = await getTarballPath();
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));
    tarballName = `sparkle-${packageJson.version}.tgz`;

    console.log('\n======================================================================');
    console.log('Setup Verification Test');
    console.log('======================================================================');
    console.log(`Using tarball: ${tarballName}\n`);

    // Create test environment
    const env = await createTestEnvironment(baseDir);
    clone1Path = env.clone1Path;
    clone2Path = env.clone2Path;
  });

  test('first clone setup creates sparkle branch and configures git correctly', async () => {
    console.log('\n📋 Test 1: Setup First Clone');
    console.log('─'.repeat(70));

    await setupFirstCloneForSparkle(clone1Path, tarballPath, tarballName);
    await verifyGitSetup(clone1Path, 'Clone 1');

    console.log('\n✅ Clone 1 verification PASSED');
  }, 120000); // 2 minute timeout

  test('later clone can enable sparkle using existing branch from origin', async () => {
    console.log('\n📋 Test 2: Enable Sparkle in Later Clone');
    console.log('─'.repeat(70));

    await enableSparkleInLaterClone(clone2Path);
    await verifyGitSetup(clone2Path, 'Clone 2');

    console.log('\n✅ Clone 2 verification PASSED');
  }, 120000); // 2 minute timeout

  afterAll(() => {
    console.log('\n' + '='.repeat(70));
    console.log('Test artifacts available at:', baseDir);
    console.log('  - Clone 1:', clone1Path);
    console.log('  - Clone 2:', clone2Path);
    console.log('='.repeat(70) + '\n');
  });
});
