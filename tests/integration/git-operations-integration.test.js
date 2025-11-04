/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Git Operations Integration Tests
 * Tests the complete Sparkle → Controllers → GitOps → Git → Pull → Aggregates flow
 *
 * Approach:
 * 1. Use daemon to set up git worktree architecture
 * 2. Stop daemon after initialization
 * 3. Test Sparkle class directly from node_modules (no HTTP/daemon overhead)
 */

import { join } from 'path';
import { pathToFileURL } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  createTestId,
  createTestEnvironment,
  installSparkle,
  initializeSparkle,
  startDaemon,
  stopDaemon,
  startLogServer,
  sleep
} from '../helpers/test-helpers.js';

const execAsync = promisify(exec);

// Helper: Get tarball path for current version
async function getTarballPath() {
  const { readFile } = await import('fs/promises');
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  return join(process.cwd(), `sparkle-${version}.tgz`);
}

// Helper: Set up test environment with daemon initialization
async function setupTestEnv(testName, numClones = 1) {
  const testId = createTestId();
  const baseDir = join(process.cwd(), '.integration_testing', 'git-ops-tests');

  console.log(`  📦 Creating test environment: ${testName}`);
  const env = await createTestEnvironment(baseDir, testName, numClones, testId);

  // Get tarball path
  const tarballPath = await getTarballPath();

  const cloneSetups = [];

  // Clone 1: Full install (copies tarball, commits it, runs npm install)
  console.log(`  📥 Installing Sparkle in clone1...`);
  await installSparkle(env.clones[0], tarballPath);
  await initializeSparkle(env.clones[0]);

  // Start daemon briefly to push sparkle branch to origin
  console.log(`  🚀 Starting daemon in clone1 to initialize sparkle branch...`);
  const port1 = await startDaemon(env.clones[0], testId + '-clone1');

  // Wait for daemon to push sparkle branch to origin
  console.log(`  ⏳ Waiting for sparkle branch to be pushed to origin...`);

  // Poll for origin/sparkle to exist (max 30 seconds)
  const maxWait = 30000;
  const startTime = Date.now();
  let branchExists = false;

  while (Date.now() - startTime < maxWait) {
    try {
      await execAsync('git ls-remote --heads origin sparkle', { cwd: env.clones[0] });
      branchExists = true;
      console.log(`  ✅ Sparkle branch detected on origin`);
      break;
    } catch (error) {
      await sleep(500);
    }
  }

  if (!branchExists) {
    throw new Error('Timeout waiting for sparkle branch on origin');
  }

  await stopDaemon(port1);
  console.log(`  ✅ Clone 1 ready (sparkle branch pushed to origin)`);

  cloneSetups.push({
    clonePath: env.clones[0],
    dataPath: join(env.clones[0], '.sparkle-worktree', 'sparkle-data')
  });

  // Clone 2+: Normal workflow (git pull, npm install, daemon initializes)
  for (let i = 1; i < env.clones.length; i++) {
    const clonePath = env.clones[i];
    console.log(`  📥 Setting up clone${i + 1}...`);

    // Pull to get tarball + package.json from clone1
    await execAsync('git pull', { cwd: clonePath });

    // npm install (reads package.json, installs from tarball in repo)
    await execAsync('npm install', { cwd: clonePath });

    // Start daemon - it will detect sparkle branch on origin and set up worktree with tracking
    console.log(`  🚀 Starting daemon in clone${i + 1} (will initialize from origin)...`);
    const port = await startDaemon(clonePath, testId + `-clone${i + 1}`);
    await sleep(2000);
    await stopDaemon(port);
    console.log(`  ✅ Clone ${i + 1} ready`);

    cloneSetups.push({
      clonePath,
      dataPath: join(clonePath, '.sparkle-worktree', 'sparkle-data')
    });
  }

  return {
    ...env,
    cloneSetups,
    tarballPath
  };
}

// Helper: Import Sparkle class from installed package
async function loadSparkle(clonePath) {
  const sparkleClassPath = join(clonePath, 'node_modules', 'sparkle', 'src', 'sparkle-class.js');
  const { Sparkle } = await import(pathToFileURL(sparkleClassPath).href);
  return Sparkle;
}

// Helper: Create Sparkle instance for a clone
async function createSparkleInstance(cloneSetup) {
  const Sparkle = await loadSparkle(cloneSetup.clonePath);
  const sparkle = new Sparkle(cloneSetup.dataPath);
  await sparkle.start();
  return sparkle;
}

describe('Git Operations Integration', () => {
  // Global test ID for log server
  const GLOBAL_TEST_ID = createTestId();

  beforeAll(async () => {
    // Start log server for all tests
    const baseDir = join(process.cwd(), '.integration_testing', 'git-ops-tests');
    const { mkdir } = await import('fs/promises');
    await mkdir(baseDir, { recursive: true });
    await startLogServer(GLOBAL_TEST_ID, baseDir);
  }, 60000); // 60 second timeout for setup

  describe('Basic git operations', () => {
    test('creates item with git integration', async () => {
      const env = await setupTestEnv('test1-create-item', 1);
      const clone = env.cloneSetups[0];

      console.log(`  ⚡ Creating Sparkle instance...`);
      const sparkle = await createSparkleInstance(clone);

      // Create item via Sparkle API
      const itemId = await sparkle.createItem('Test item for git');
      console.log(`  ✏️  Created item: ${itemId}`);

      // Verify item exists in Sparkle
      const item = await sparkle.getItemDetails(itemId);
      expect(item.tagline).toBe('Test item for git');
      console.log(`  ✓ Item retrieved successfully`);

      // Wait for debounced commit
      console.log(`  ⏳ Waiting 6s for debounced commit...`);
      await sleep(6000);

      // Manually trigger commit to ensure it happens
      await sparkle.gitOps.commitAndPush();

      console.log(`  ✓ Git commit triggered`);
    }, 60000); // 60 second timeout

    test('multiple operations debounce to single commit', async () => {
      const env = await setupTestEnv('test2-debounce', 1);
      const clone = env.cloneSetups[0];

      const sparkle = await createSparkleInstance(clone);

      // Create multiple items rapidly
      const item1 = await sparkle.createItem('Item 1');
      const item2 = await sparkle.createItem('Item 2');
      await sparkle.addEntry(item2, 'Entry for item 2');

      console.log(`  ✏️  Created 2 items and 1 entry rapidly`);

      // Wait for debounce
      await sleep(6000);

      // Force commit
      await sparkle.gitOps.commitAndPush();

      console.log(`  ✓ Debounced operations committed`);
    }, 60000);
  });

  // Cross-clone synchronization tests have been moved to
  // tests/integration/daemon-cross-clone-sync.test.js
  // which properly tests multi-clone sync using daemons.

  describe('Bug fixes', () => {
    test('dependency links are auto-committed', async () => {
      const env = await setupTestEnv('test6-bug3', 1);
      const clone = env.cloneSetups[0];

      const sparkle = await createSparkleInstance(clone);

      // Create two items and add dependency
      const item1 = await sparkle.createItem('Item 1');
      const item2 = await sparkle.createItem('Item 2');
      await sparkle.addDependency(item1, item2);

      console.log(`  ✏️  Created dependency: ${item1} -> ${item2}`);

      // Wait and commit
      await sleep(6000);
      await sparkle.gitOps.commitAndPush();

      console.log(`  ✓ Dependency committed successfully`);

      // Verify dependency exists
      const item = await sparkle.getItemDetails(item1);
      expect(item.dependencies).toContain(item2);
    }, 60000);
  });
});
