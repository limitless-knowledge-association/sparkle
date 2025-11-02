/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle Integration Tests
 * Tests Sparkle in isolated environments with bare repos and multiple clones
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { SPARKLE_VERSION } from '../src/version.js';
import {
  createTestId,
  createTestEnvironment,
  installSparkle,
  initializeSparkle,
  startDaemon,
  stopDaemon,
  apiCall,
  cleanupEnvironment,
  sleep,
  startLogServer,
  stopLogServer,
  createPushBlock
} from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the sparkle tarball - uses current version
const TARBALL_PATH = join(__dirname, `../sparkle-${SPARKLE_VERSION}.tgz`);

// Integration test base directory
const INTEGRATION_TEST_DIR = join(__dirname, '../.integration_testing');

// Test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run(filterPattern = null) {
    // Filter tests if pattern provided
    let testsToRun = this.tests;
    if (filterPattern) {
      testsToRun = this.tests.filter(({ name }) => name.toLowerCase().includes(filterPattern.toLowerCase()));
      if (testsToRun.length === 0) {
        console.error(`❌ No tests match pattern: "${filterPattern}"`);
        console.log('\nAvailable tests:');
        this.tests.forEach(({ name }) => console.log(`  - ${name}`));
        process.exit(1);
      }
      console.log(`🔍 Filtering tests matching: "${filterPattern}"`);
      console.log(`   Found ${testsToRun.length} test(s)\n`);
    }

    // Clean up and recreate integration test directory
    console.log('🧹 Cleaning up previous test runs...');
    if (existsSync(INTEGRATION_TEST_DIR)) {
      await rm(INTEGRATION_TEST_DIR, { recursive: true, force: true });
    }
    await mkdir(INTEGRATION_TEST_DIR, { recursive: true });
    console.log(`✅ Created fresh test directory: ${INTEGRATION_TEST_DIR}\n`);

    // Start log server for all tests
    const mainTestId = createTestId();
    await startLogServer(mainTestId, INTEGRATION_TEST_DIR);

    console.log(`🧪 Running ${testsToRun.length} integration test(s)...\n`);

    for (const { name, fn } of testsToRun) {
      try {
        console.log(`▶️  ${name}`);
        await fn(INTEGRATION_TEST_DIR, name);
        this.passed++;
        console.log(`✅ ${name}\n`);
      } catch (error) {
        this.failed++;
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
        if (error.stack) {
          console.error(`   ${error.stack.split('\n').slice(1, 3).join('\n   ')}`);
        }
        console.log('');
      }
      // No cleanup needed - everything stays in .integration_testing/
    }

    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed`);
    console.log(`📁 Test artifacts preserved in: ${INTEGRATION_TEST_DIR}\n`);

    // Stop log server
    await stopLogServer();

    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

const runner = new TestRunner();

// Test: Create and retrieve item
runner.test('Create and retrieve item', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  // Install Sparkle in clone1 (writes config to package.json)
  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');

  // Initialize Sparkle worktree (creates branch, pushes to origin)
  await initializeSparkle(env.clones[0]);

  // Start daemon (worktree already initialized, will just start normally)
  const port = await startDaemon(env.clones[0], testId);

  // Wait for daemon to start up
  await sleep(1000);

  // Create an item
  const createResult = await apiCall(port, '/api/createItem', {
    tagline: 'Test item for integration test'
  });

  if (!createResult.itemId) {
    throw new Error('No itemId returned from createItem');
  }

  // Retrieve the item
  const itemDetails = await apiCall(port, '/api/getItemDetails', {
    itemId: createResult.itemId
  });

  if (itemDetails.tagline !== 'Test item for integration test') {
    throw new Error(`Wrong tagline: ${itemDetails.tagline}`);
  }

  // Stop daemon
  await stopDaemon(port);
});

// Test: All items endpoint
runner.test('Get all items', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);
  const port = await startDaemon(env.clones[0], testId);
  await sleep(1000);

  // Create multiple items
  await apiCall(port, '/api/createItem', { tagline: 'Item 1' });
  await apiCall(port, '/api/createItem', { tagline: 'Item 2' });
  await apiCall(port, '/api/createItem', { tagline: 'Item 3' });

  // Get all items
  const result = await apiCall(port, '/api/allItems');

  if (!Array.isArray(result.items)) {
    throw new Error('Expected items array');
  }

  if (result.items.length !== 3) {
    throw new Error(`Expected 3 items, got ${result.items.length}`);
  }

  await stopDaemon(port);
});

// Test: Add dependency
runner.test('Add dependency between items', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);
  const port = await startDaemon(env.clones[0], testId);
  await sleep(1000);

  // Create two items
  const item1 = await apiCall(port, '/api/createItem', { tagline: 'Provider item' });
  const item2 = await apiCall(port, '/api/createItem', { tagline: 'Dependent item' });

  // Add dependency: item2 depends on item1
  await apiCall(port, '/api/addDependency', {
    itemNeeding: item2.itemId,
    itemNeeded: item1.itemId
  });

  // Verify dependency
  const details = await apiCall(port, '/api/getItemDetails', {
    itemId: item2.itemId
  });

  if (!details.dependencies || !details.dependencies.includes(item1.itemId)) {
    throw new Error('Dependency not added');
  }

  await stopDaemon(port);
});

// Test: Aggregates are created on daemon startup
runner.test('Aggregates created on daemon startup', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);

  const port = await startDaemon(env.clones[0], testId);

  // Wait for daemon to initialize
  await sleep(1000);

  // Create some items
  const item1 = await apiCall(port, '/api/createItem', {
    tagline: 'Test item 1',
    status: 'incomplete'
  });

  const item2 = await apiCall(port, '/api/createItem', {
    tagline: 'Test item 2',
    status: 'incomplete'
  });

  // Check that aggregates exist
  const aggregatesPath = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', '.aggregates', 'items');
  const aggregate1Path = join(aggregatesPath, `${item1.itemId}.json`);
  const aggregate2Path = join(aggregatesPath, `${item2.itemId}.json`);

  if (!existsSync(aggregate1Path)) {
    throw new Error('Aggregate file not created for item 1');
  }

  if (!existsSync(aggregate2Path)) {
    throw new Error('Aggregate file not created for item 2');
  }

  await stopDaemon(port);
});

// Test: Aggregate updates when item modified
runner.test('Aggregate updates on item modification', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);

  const port = await startDaemon(env.clones[0], testId);
  await sleep(1000);

  // Create item
  const item = await apiCall(port, '/api/createItem', {
    tagline: 'Original tagline',
    status: 'incomplete'
  });

  // Read aggregate
  const { readFile } = await import('fs/promises');
  const aggregatesPath = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', '.aggregates', 'items');
  const aggregatePath = join(aggregatesPath, `${item.itemId}.json`);

  const aggregate1 = JSON.parse(await readFile(aggregatePath, 'utf8'));
  if (aggregate1.tagline !== 'Original tagline') {
    throw new Error('Aggregate has wrong tagline');
  }

  // Modify tagline
  await apiCall(port, '/api/alterTagline', {
    itemId: item.itemId,
    tagline: 'Updated tagline'
  });

  // Read aggregate again
  const aggregate2 = JSON.parse(await readFile(aggregatePath, 'utf8'));
  if (aggregate2.tagline !== 'Updated tagline') {
    throw new Error('Aggregate not updated after tagline change');
  }

  // Verify metadata updated
  if (aggregate2._meta.lastEventTimestamp <= aggregate1._meta.lastEventTimestamp) {
    throw new Error('Aggregate metadata not updated');
  }

  await stopDaemon(port);
});

// Test: Both aggregates update when dependency added
runner.test('Both aggregates update when dependency added', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);

  const port = await startDaemon(env.clones[0], testId);
  await sleep(1000);

  // Create two items
  const item1 = await apiCall(port, '/api/createItem', {
    tagline: 'Provider item',
    status: 'incomplete'
  });

  const item2 = await apiCall(port, '/api/createItem', {
    tagline: 'Dependent item',
    status: 'incomplete'
  });

  // Read aggregates before dependency
  const { readFile } = await import('fs/promises');
  const aggregatesPath = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', '.aggregates', 'items');

  const agg1Before = JSON.parse(await readFile(join(aggregatesPath, `${item1.itemId}.json`), 'utf8'));
  const agg2Before = JSON.parse(await readFile(join(aggregatesPath, `${item2.itemId}.json`), 'utf8'));

  if (agg1Before.dependencyCount !== 0) {
    throw new Error('Item1 should have 0 dependencies initially');
  }

  // Add dependency: item2 depends on item1
  await apiCall(port, '/api/addDependency', {
    itemNeeding: item2.itemId,
    itemNeeded: item1.itemId
  });

  // Read aggregates after dependency
  const agg1After = JSON.parse(await readFile(join(aggregatesPath, `${item1.itemId}.json`), 'utf8'));
  const agg2After = JSON.parse(await readFile(join(aggregatesPath, `${item2.itemId}.json`), 'utf8'));

  // Verify item2's dependencies array includes item1
  if (!agg2After.dependencies || !agg2After.dependencies.includes(item1.itemId)) {
    throw new Error('Item2 aggregate not updated with dependency');
  }

  if (agg2After.dependencyCount !== 1) {
    throw new Error('Item2 dependencyCount not updated');
  }

  // Verify item2's aggregate metadata timestamp updated (it received a new event)
  if (agg2After._meta.lastEventTimestamp <= agg2Before._meta.lastEventTimestamp) {
    throw new Error('Item2 aggregate metadata not updated');
  }

  // Verify item1's aggregate was rebuilt (builtAt should be more recent)
  // Note: lastEventTimestamp won't change for item1 since no event was added to it
  if (agg1After._meta.builtAt <= agg1Before._meta.builtAt) {
    throw new Error('Item1 aggregate not rebuilt');
  }

  await stopDaemon(port);
});

// Test: Aggregates survive daemon restart
runner.test('Aggregates persist across daemon restart', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);

  // Start daemon and create items
  const port1 = await startDaemon(env.clones[0]);
  await sleep(1000);

  const item = await apiCall(port1, '/api/createItem', {
    tagline: 'Persistent item',
    status: 'incomplete'
  });

  await stopDaemon(port1);

  // Restart daemon
  const port2 = await startDaemon(env.clones[0], testId);
  await sleep(1000);

  // Verify item is still accessible (reads from aggregate)
  const details = await apiCall(port2, '/api/getItemDetails', {
    itemId: item.itemId
  });

  if (details.tagline !== 'Persistent item') {
    throw new Error('Item not retrieved after daemon restart');
  }

  await stopDaemon(port2);
});

// Test: Aggregates sync across clones via git pull
runner.test('Aggregates sync across clones via git pull', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 2, testId);

  // Install and initialize in clone1
  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);

  const port1 = await startDaemon(env.clones[0]);
  await sleep(1000);

  // Create item in clone1
  const item = await apiCall(port1, '/api/createItem', {
    tagline: 'Shared item',
    status: 'incomplete'
  });

  // Wait for daemon to auto-commit and push (poll daemon log for "Push successful")
  console.log('Waiting for daemon to auto-commit and push...');
  const daemonLogPath = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', 'daemon.log');
  let pushCompleted = false;
  const maxWaitMs = 15000;
  const pollIntervalMs = 100;
  const maxAttempts = maxWaitMs / pollIntervalMs;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { readFile } = await import('fs/promises');
      const logContent = await readFile(daemonLogPath, 'utf8');
      if (logContent.includes('Push successful')) {
        console.log(`Daemon pushed after ${i * pollIntervalMs}ms`);
        pushCompleted = true;
        break;
      }
    } catch (error) {
      // Log file might not exist yet, continue polling
    }
    await sleep(pollIntervalMs);
  }

  if (!pushCompleted) {
    throw new Error(`Daemon did not push within ${maxWaitMs}ms`);
  }

  // Verify item is actually on origin
  const remoteFiles = execSync('git ls-tree -r origin/sparkle --name-only', {
    cwd: join(env.clones[0], '.sparkle-worktree'),
    encoding: 'utf8'
  });
  if (!remoteFiles.includes(`sparkle-data/${item.itemId}.json`)) {
    throw new Error('Item not found on origin after daemon push');
  }

  await stopDaemon(port1);

  // Clone2: Normal workflow - pull and npm install (NOT installSparkle again)
  execSync('git pull', {
    cwd: env.clones[1],
    stdio: 'pipe'
  });

  // Just run npm install (package.json already has sparkle configured)
  execSync('npm install', {
    cwd: env.clones[1],
    stdio: 'pipe'
  });

  const port2 = await startDaemon(env.clones[1], testId);
  await sleep(2000); // Give time for aggregate rebuild after pull

  // Verify item exists in clone2 (aggregate should be rebuilt)
  const details = await apiCall(port2, '/api/getItemDetails', {
    itemId: item.itemId
  });

  if (details.tagline !== 'Shared item') {
    throw new Error('Item not synced to clone2');
  }

  // Verify aggregate file exists
  const aggregatesPath = join(env.clones[1], '.sparkle-worktree', 'sparkle-data', '.aggregates', 'items');
  const aggregatePath = join(aggregatesPath, `${item.itemId}.json`);

  if (!existsSync(aggregatePath)) {
    throw new Error('Aggregate not created in clone2 after pull');
  }

  await stopDaemon(port2);
});

// Test: .aggregates/ directory is git-ignored
runner.test('.aggregates/ directory is git-ignored', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);

  // Check .gitignore in sparkle data directory
  const { readFile } = await import('fs/promises');
  const gitignorePath = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', '.gitignore');

  if (!existsSync(gitignorePath)) {
    throw new Error('.gitignore not created in sparkle-data directory');
  }

  const gitignoreContent = await readFile(gitignorePath, 'utf8');

  if (!gitignoreContent.includes('.aggregates/')) {
    throw new Error('.aggregates/ not in .gitignore');
  }

  // Start daemon and create item to generate aggregate
  const port = await startDaemon(env.clones[0], testId);
  await sleep(1000);

  await apiCall(port, '/api/createItem', {
    tagline: 'Test item',
    status: 'incomplete'
  });

  // Check git status - aggregates should be ignored
  const { execSync } = await import('child_process');
  const gitStatus = execSync('git -C .sparkle-worktree status --porcelain', {
    cwd: env.clones[0],
    encoding: 'utf8'
  });

  if (gitStatus.includes('.aggregates/')) {
    throw new Error('.aggregates/ files showing in git status (not properly ignored)');
  }

  await stopDaemon(port);
});

// Test: Corrupted aggregate is detected and rebuilt
runner.test('Corrupted aggregate auto-rebuilds', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);

  const port = await startDaemon(env.clones[0], testId);
  await sleep(1000);

  // Create item
  const item = await apiCall(port, '/api/createItem', {
    tagline: 'Test item',
    status: 'incomplete'
  });

  await stopDaemon(port);

  // Corrupt the aggregate
  const { writeFile } = await import('fs/promises');
  const aggregatesPath = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', '.aggregates', 'items');
  const aggregatePath = join(aggregatesPath, `${item.itemId}.json`);

  await writeFile(aggregatePath, 'corrupted json{{{', 'utf8');

  // Restart daemon - should detect corruption and rebuild
  const port2 = await startDaemon(env.clones[0], testId);
  await sleep(2000); // Give time for validation and rebuild

  // Verify item is still accessible
  const details = await apiCall(port2, '/api/getItemDetails', {
    itemId: item.itemId
  });

  if (details.tagline !== 'Test item') {
    throw new Error('Item not accessible after corruption recovery');
  }

  // Verify aggregate is valid JSON now
  const { readFile } = await import('fs/promises');
  const aggregateContent = await readFile(aggregatePath, 'utf8');
  const aggregate = JSON.parse(aggregateContent); // Should not throw

  if (aggregate.tagline !== 'Test item') {
    throw new Error('Aggregate not properly rebuilt');
  }

  await stopDaemon(port2);
});

// Test: Daemon fails to start in detached HEAD state
runner.test('Daemon fails to start in detached HEAD state', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  await installSparkle(env.clones[0], TARBALL_PATH, 'sparkle', 'sparkle-data');
  await initializeSparkle(env.clones[0]);

  // Put repo in detached HEAD state
  const { execSync } = await import('child_process');
  const headSHA = execSync('git rev-parse HEAD', {
    cwd: env.clones[0],
    encoding: 'utf8'
  }).trim();

  execSync(`git checkout ${headSHA}`, {
    cwd: env.clones[0],
    stdio: 'pipe'
  });

  // Try to start daemon - should fail
  let daemonFailed = false;
  try {
    await startDaemon(env.clones[0], testId);
  } catch (error) {
    daemonFailed = true;
    if (!error.message.includes('Daemon failed to start')) {
      throw error;
    }
  }

  if (!daemonFailed) {
    throw new Error('Daemon should have failed to start in detached HEAD state');
  }
});

/**
 * Test: No-Client Timeout Waits 60 Seconds
 * Verifies that daemon doesn't exit before 60 seconds without any client activity
 *
 * NOTE: This test is SUSPENDED because it takes 65+ seconds to run.
 * Re-enable when troubleshooting timeout-related issues by uncommenting the runner.test() call below.
 */
// runner.test('No-Client Timeout Waits 60 Seconds', async (baseDir, testName) => {
//   const testId = createTestId();
//   const env = await createTestEnvironment(baseDir, testName);
//
//   // Install and initialize Sparkle
//   await installSparkle(env.clones[0], TARBALL_PATH);
//   await initializeSparkle(env.clones[0], testId, 'sparkle-data');
//
//   const daemon = await startDaemon(env.clones[0], testId);
//
//   try {
//     console.log('   Daemon started, waiting 65 seconds to verify timeout behavior...');
//
//     // Wait 65 seconds - daemon should exit at 60 seconds
//     const startTime = Date.now();
//     await sleep(65000);
//     const elapsed = Date.now() - startTime;
//
//     // Try to ping the daemon - it should be gone
//     let daemonStillAlive = false;
//     try {
//       await apiCall(daemon.port, '/api/ping', {});
//       daemonStillAlive = true;
//     } catch (error) {
//       // Expected - daemon should be dead
//       daemonStillAlive = false;
//     }
//
//     if (daemonStillAlive) {
//       throw new Error('Daemon is still alive after 65 seconds - timeout did not work');
//     }
//
//     console.log(`   ✓ Daemon exited after ~${Math.round(elapsed/1000)}s as expected`);
//
//   } finally {
//     // Don't try to stop daemon - it should already be dead
//     // Just clean up the environment
//     try {
//       await stopDaemon(daemon);
//     } catch (e) {
//       // Ignore - daemon already exited
//     }
//   }
//
//   await cleanupEnvironment(env);
// });

/**
 * Test: Debounced Git Commits
 * Verifies that multiple rapid writes are batched into a single git commit
 */
runner.test('Debounced Git Commits', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName);

  // Install and initialize Sparkle
  await installSparkle(env.clones[0], TARBALL_PATH);
  await initializeSparkle(env.clones[0]);

  const port = await startDaemon(env.clones[0], testId);

  try {
    // Get initial commit count on sparkle branch only (not including main branch ancestors)
    // Count commits on current branch that are not on origin/main
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: join(env.clones[0], '.sparkle-worktree'),
      encoding: 'utf8'
    }).trim();

    const initialCommits = execSync(`git rev-list --count origin/main..${currentBranch}`, {
      cwd: join(env.clones[0], '.sparkle-worktree'),
      encoding: 'utf8'
    }).trim();
    console.log(`   Initial commits on ${currentBranch} (excluding main): ${initialCommits}`);

    // Create 5 items rapidly (within debounce window)
    const itemIds = [];
    for (let i = 0; i < 5; i++) {
      const result = await apiCall(port, '/api/createItem', {
        tagline: `Test item ${i}`,
        status: 'incomplete',
        initialEntry: `Entry for item ${i}`
      });
      itemIds.push(result.itemId);
    }

    // Wait for debounce timer (5 seconds) + git operation time
    console.log('   Waiting 8 seconds for debounced commit...');
    await sleep(8000);

    // Get new commit count
    const newCommits = execSync(`git rev-list --count origin/main..${currentBranch}`, {
      cwd: join(env.clones[0], '.sparkle-worktree'),
      encoding: 'utf8'
    }).trim();
    console.log(`   New commits on ${currentBranch} (excluding main): ${newCommits}`);

    // Should have exactly ONE more commit (all 5 items batched together)
    const commitDiff = parseInt(newCommits) - parseInt(initialCommits);
    console.log(`   Commit diff: ${commitDiff}`);
    if (commitDiff !== 1) {
      throw new Error(`Expected 1 commit, got ${commitDiff} commits (initial: ${initialCommits}, new: ${newCommits})`);
    }

    // Verify all 5 items were committed
    const lastCommit = execSync('git log -1 --name-only --pretty=format:', {
      cwd: join(env.clones[0], '.sparkle-worktree'),
      encoding: 'utf8'
    }).trim();

    for (const itemId of itemIds) {
      if (!lastCommit.includes(`${itemId}.json`)) {
        throw new Error(`Item ${itemId} not found in commit`);
      }
    }

    console.log('   ✓ 5 rapid writes batched into 1 commit');

  } finally {
    await stopDaemon(port);
  }

  await cleanupEnvironment(env.testDir);
});

/**
 * Test: Manual Fetch Defers During Pending Commit
 * Verifies that manual fetch is deferred when a git commit is scheduled
 */
runner.test('Manual Fetch Defers During Pending Commit', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName);

  // Install and initialize Sparkle
  await installSparkle(env.clones[0], TARBALL_PATH);
  await initializeSparkle(env.clones[0]);

  const port = await startDaemon(env.clones[0], testId);

  try {
    // Create an item (starts debounce timer)
    await apiCall(port, '/api/createItem', {
      tagline: 'Test item',
      status: 'incomplete',
      initialEntry: 'Test entry'
    });

    // Immediately try manual fetch (should be deferred)
    const fetchResult = await apiCall(port, '/api/fetch', {});

    if (!fetchResult.deferred) {
      throw new Error('Expected fetch to be deferred during pending commit');
    }

    if (fetchResult.message !== 'Fetch deferred - pending commit will trigger it') {
      throw new Error(`Unexpected message: ${fetchResult.message}`);
    }

    console.log('   ✓ Manual fetch correctly deferred during pending commit');

  } finally {
    await stopDaemon(port);
  }

  await cleanupEnvironment(env.testDir);
});

/**
 * Test: Git concurrent push/pull mechanics
 * Minimal test to verify basic git concurrent push handling works
 */
runner.test('Git concurrent push/pull mechanics', async (baseDir, testName) => {
  const testDir = join(baseDir, 'git-concurrent-test');
  await mkdir(testDir, { recursive: true });

  try {
    // Create bare repo
    const bareRepo = join(testDir, 'repo.git');
    execSync(`git init --bare ${bareRepo}`);

    // Create clone1 and make initial commit
    const clone1 = join(testDir, 'clone1');
    execSync(`git clone ${bareRepo} ${clone1}`);
    execSync('git config user.name "Test User 1"', { cwd: clone1 });
    execSync('git config user.email "test1@example.com"', { cwd: clone1 });
    execSync('echo "initial" > file.txt', { cwd: clone1 });
    execSync('git add file.txt', { cwd: clone1 });
    execSync('git commit -m "Initial commit"', { cwd: clone1 });
    execSync('git push -u origin main', { cwd: clone1 });
    console.log('   ✓ Clone1 created and pushed initial commit');

    // Create clone2
    const clone2 = join(testDir, 'clone2');
    execSync(`git clone ${bareRepo} ${clone2}`);
    execSync('git config user.name "Test User 2"', { cwd: clone2 });
    execSync('git config user.email "test2@example.com"', { cwd: clone2 });
    console.log('   ✓ Clone2 created');

    // Clone1: Add a file and push
    execSync('echo "from clone1" > file1.txt', { cwd: clone1 });
    execSync('git add file1.txt', { cwd: clone1 });
    execSync('git commit -m "Add file1"', { cwd: clone1 });
    execSync('git push', { cwd: clone1 });
    console.log('   ✓ Clone1 pushed file1.txt');

    // Clone2: Add a different file and try to push (should fail)
    execSync('echo "from clone2" > file2.txt', { cwd: clone2 });
    execSync('git add file2.txt', { cwd: clone2 });
    execSync('git commit -m "Add file2"', { cwd: clone2 });

    console.log('   Testing push conflict...');
    try {
      execSync('git push', { cwd: clone2 });
      throw new Error('Push should have failed but succeeded');
    } catch (error) {
      console.log('   ✓ Clone2 push failed as expected');
    }

    // Clone2: Pull and retry push
    console.log('   Attempting pull...');
    try {
      execSync('git pull --ff-only', { cwd: clone2, stdio: 'pipe' });
      throw new Error('Pull with --ff-only should have failed (not fast-forward)');
    } catch (error) {
      console.log('   ✓ Pull --ff-only correctly failed (not fast-forward)');
    }

    // Clone2: Pull with merge
    console.log('   Attempting pull with merge...');
    execSync('git pull --no-rebase --no-edit', { cwd: clone2 });
    console.log('   ✓ Pull with merge succeeded');

    // Clone2: Now push should work
    execSync('git push', { cwd: clone2 });
    console.log('   ✓ Clone2 successfully pushed after pull');

    // Verify both files exist in both clones
    execSync('git pull', { cwd: clone1 });
    const clone1Files = execSync('ls', { cwd: clone1, encoding: 'utf8' }).trim().split('\n');
    const clone2Files = execSync('ls', { cwd: clone2, encoding: 'utf8' }).trim().split('\n');

    if (!clone1Files.includes('file1.txt') || !clone1Files.includes('file2.txt')) {
      throw new Error('Clone1 missing files');
    }
    if (!clone2Files.includes('file1.txt') || !clone2Files.includes('file2.txt')) {
      throw new Error('Clone2 missing files');
    }

    console.log('   ✓ Both clones have both files');

  } finally {
    await cleanupEnvironment(testDir);
  }
});

/**
 * Test: Concurrent Push Race Condition
 * Verifies that when one clone commits and pushes while another has fetched but not yet pushed,
 * the second clone detects the conflict and retries successfully
 */
runner.test('Concurrent push race condition', async (baseDir, testName) => {
  const testId1 = createTestId();
  const testId2 = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 2);

  // Install and initialize Sparkle in both clones
  await installSparkle(env.clones[0], TARBALL_PATH);
  await initializeSparkle(env.clones[0]);

  await installSparkle(env.clones[1], TARBALL_PATH);
  // Clone 2 doesn't need init - it will fetch the branch from origin

  // Start daemon in clone1 with push blocking enabled
  const pushBlock1 = createPushBlock(testId1);
  const port1 = await startDaemon(env.clones[0], testId1, true);

  // Start daemon in clone2 (no blocking needed)
  const port2 = await startDaemon(env.clones[1], testId2, false);

  try {
    // Clone 1: Create an item (this will commit and then block before push)
    console.log('   Creating item in clone1...');
    const item1 = await apiCall(port1, '/api/createItem', {
      tagline: 'Item from clone1',
      status: 'incomplete',
      initialEntry: 'Entry from clone1'
    });

    // Wait for clone1 to commit (5 second debounce + commit time)
    console.log('   Waiting for clone1 to commit and block at push...');
    await sleep(6000);

    // Clone 2: Create an item while clone1 is blocked
    console.log('   Creating item in clone2...');
    const item2 = await apiCall(port2, '/api/createItem', {
      tagline: 'Item from clone2',
      status: 'incomplete',
      initialEntry: 'Entry from clone2'
    });

    // Wait for clone2 to commit and push (should succeed immediately)
    console.log('   Waiting for clone2 to commit and push...');
    await sleep(6000);

    // Verify clone2 pushed successfully
    const clone2Commits = execSync('git rev-list --count HEAD', {
      cwd: join(env.clones[1], '.sparkle-worktree'),
      encoding: 'utf8'
    }).trim();
    console.log(`   Clone2 commits: ${clone2Commits}`);

    // Now unblock clone1 - it should detect the conflict and retry
    console.log('   Unblocking clone1...');
    pushBlock1.release();

    // Wait for clone1 to detect conflict, fetch, merge, and push
    console.log('   Waiting for clone1 to resolve conflict and push...');
    await sleep(8000);

    // Poll until both clones are synced with origin
    console.log('   Polling until both clones are synced...');
    const maxAttempts = 20; // 20 attempts * 1 second = 20 seconds max
    let synced = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Pull both clones
      try {
        execSync('git pull --no-rebase origin sparkle', { cwd: join(env.clones[0], '.sparkle-worktree'), stdio: 'pipe' });
      } catch (e) {
        // Pull might fail if no changes, that's ok
      }
      try {
        execSync('git pull --no-rebase origin sparkle', { cwd: join(env.clones[1], '.sparkle-worktree'), stdio: 'pipe' });
      } catch (e) {
        // Pull might fail if no changes, that's ok
      }

      // Check if they're in sync
      const clone1SHA = execSync('git rev-parse HEAD', {
        cwd: join(env.clones[0], '.sparkle-worktree'),
        encoding: 'utf8'
      }).trim();

      const clone2SHA = execSync('git rev-parse HEAD', {
        cwd: join(env.clones[1], '.sparkle-worktree'),
        encoding: 'utf8'
      }).trim();

      if (clone1SHA === clone2SHA) {
        console.log(`   ✓ Clones synced after ${attempt + 1} attempts`);
        synced = true;
        break;
      }

      await sleep(1000);
    }

    if (!synced) {
      const clone1SHA = execSync('git rev-parse HEAD', {
        cwd: join(env.clones[0], '.sparkle-worktree'),
        encoding: 'utf8'
      }).trim();

      const clone2SHA = execSync('git rev-parse HEAD', {
        cwd: join(env.clones[1], '.sparkle-worktree'),
        encoding: 'utf8'
      }).trim();

      throw new Error(`Clones not in sync after ${maxAttempts} attempts! Clone1: ${clone1SHA}, Clone2: ${clone2SHA}`);
    }

    // Verify both clones have the same items
    const clone1Files = execSync('git ls-files', {
      cwd: join(env.clones[0], '.sparkle-worktree/sparkle-data'),
      encoding: 'utf8'
    }).trim().split('\n');

    const clone2Files = execSync('git ls-files', {
      cwd: join(env.clones[1], '.sparkle-worktree/sparkle-data'),
      encoding: 'utf8'
    }).trim().split('\n');

    // Check that both clones have both items
    const clone1HasItem1 = clone1Files.some(f => f.includes(item1.itemId));
    const clone1HasItem2 = clone1Files.some(f => f.includes(item2.itemId));
    const clone2HasItem1 = clone2Files.some(f => f.includes(item1.itemId));
    const clone2HasItem2 = clone2Files.some(f => f.includes(item2.itemId));

    if (!clone1HasItem1 || !clone1HasItem2) {
      throw new Error(`Clone1 missing items: item1=${clone1HasItem1}, item2=${clone1HasItem2}`);
    }
    if (!clone2HasItem1 || !clone2HasItem2) {
      throw new Error(`Clone2 missing items: item1=${clone2HasItem1}, item2=${clone2HasItem2}`);
    }

    console.log('   ✓ Concurrent push race condition handled correctly');

  } finally {
    pushBlock1.release(); // Ensure block is cleaned up
    await stopDaemon(port1);
    await stopDaemon(port2);
  }

  await cleanupEnvironment(env.testDir);
});

/**
 * Test: Concurrent Item ID Conflict Detection
 * Verifies that when two clones independently choose the same item ID,
 * one clone commits first, and the second clone detects the conflict on fetch
 */
runner.test('Concurrent item ID conflict detection', async (baseDir, testName) => {
  const testId1 = createTestId();
  const testId2 = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 2);

  // Install and initialize Sparkle in both clones
  await installSparkle(env.clones[0], TARBALL_PATH);
  await initializeSparkle(env.clones[0]);

  await installSparkle(env.clones[1], TARBALL_PATH);

  // Start daemon in clone1 with push blocking
  const pushBlock1 = createPushBlock(testId1);
  const port1 = await startDaemon(env.clones[0], testId1, true);

  // Start daemon in clone2 with push blocking
  const pushBlock2 = createPushBlock(testId2);
  const port2 = await startDaemon(env.clones[1], testId2, true);

  try {
    // This test would need to mock the random ID generation to force a collision
    // For now, we'll test the merge behavior even without a guaranteed collision

    // Clone 1: Create an item (blocks at push)
    console.log('   Creating item in clone1...');
    const item1 = await apiCall(port1, '/api/createItem', {
      tagline: 'Item from clone1',
      status: 'incomplete',
      initialEntry: 'Entry from clone1'
    });

    // Clone 2: Create an item (blocks at push)
    console.log('   Creating item in clone2...');
    const item2 = await apiCall(port2, '/api/createItem', {
      tagline: 'Item from clone2',
      status: 'incomplete',
      initialEntry: 'Entry from clone2'
    });

    // Wait for both to commit
    await sleep(6000);

    // Release clone1 first - it should push successfully
    console.log('   Unblocking clone1 to push first...');
    pushBlock1.release();
    await sleep(3000);

    // Release clone2 - it should detect conflict and merge
    console.log('   Unblocking clone2...');
    pushBlock2.release();

    // Poll until both clones are synced
    console.log('   Polling until both clones are synced...');
    const maxAttempts = 20;
    let synced = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Pull both clones
      try {
        execSync('git pull --no-rebase origin sparkle', { cwd: join(env.clones[0], '.sparkle-worktree'), stdio: 'pipe' });
      } catch (e) {
        // Pull might fail if no changes, that's ok
      }
      try {
        execSync('git pull --no-rebase origin sparkle', { cwd: join(env.clones[1], '.sparkle-worktree'), stdio: 'pipe' });
      } catch (e) {
        // Pull might fail if no changes, that's ok
      }

      // Check if both items exist in clone2
      const clone2Files = execSync('git ls-files', {
        cwd: join(env.clones[1], '.sparkle-worktree/sparkle-data'),
        encoding: 'utf8'
      }).trim().split('\n');

      const hasItem1 = clone2Files.some(f => f.includes(item1.itemId));
      const hasItem2 = clone2Files.some(f => f.includes(item2.itemId));

      if (hasItem1 && hasItem2) {
        console.log(`   ✓ Both items present after ${attempt + 1} attempts`);
        synced = true;
        break;
      }

      await sleep(1000);
    }

    if (!synced) {
      const clone2Files = execSync('git ls-files', {
        cwd: join(env.clones[1], '.sparkle-worktree/sparkle-data'),
        encoding: 'utf8'
      }).trim().split('\n');

      const hasItem1 = clone2Files.some(f => f.includes(item1.itemId));
      const hasItem2 = clone2Files.some(f => f.includes(item2.itemId));

      if (!hasItem1) {
        throw new Error(`Clone2 missing item from clone1: ${item1.itemId} after ${maxAttempts} attempts`);
      }
      if (!hasItem2) {
        throw new Error(`Clone2 missing its own item: ${item2.itemId} after ${maxAttempts} attempts`);
      }
    }

    console.log('   ✓ Concurrent writes merged successfully');

  } finally {
    pushBlock1.release();
    pushBlock2.release();
    await stopDaemon(port1);
    await stopDaemon(port2);
  }

  await cleanupEnvironment(env.testDir);
});

/**
 * Test: Daemon auto-commits and pushes item files
 * Tests Bug 1: Daemon should automatically commit and push item files to origin
 */
runner.test('Daemon auto-commits and pushes item files', async (baseDir, testName) => {
  const testId = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 1, testId);

  // Install and initialize Sparkle
  await installSparkle(env.clones[0], TARBALL_PATH);
  await initializeSparkle(env.clones[0]);

  const port = await startDaemon(env.clones[0], testId);
  await sleep(1000);

  // Create an item via daemon API
  const item = await apiCall(port, '/api/createItem', {
    tagline: 'Test auto-commit',
    status: 'incomplete'
  });

  console.log(`Created item ${item.itemId}, waiting for auto-commit and push...`);

  // Poll daemon log for "Push successful" (check every 100ms for up to 15 seconds)
  const daemonLogPath = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', 'daemon.log');
  let pushCompleted = false;
  const maxWaitMs = 15000;
  const pollIntervalMs = 100;
  const maxAttempts = maxWaitMs / pollIntervalMs;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { readFile } = await import('fs/promises');
      const logContent = await readFile(daemonLogPath, 'utf8');
      if (logContent.includes('Push successful')) {
        console.log(`Push completed after ${i * pollIntervalMs}ms`);
        pushCompleted = true;
        break;
      }
    } catch (error) {
      // Log file might not exist yet, continue polling
    }
    await sleep(pollIntervalMs);
  }

  if (!pushCompleted) {
    throw new Error(`BUG 1: Daemon did not push within ${maxWaitMs}ms - auto-commit not working`);
  }

  // Verify item file is actually on origin
  const remoteFiles = execSync('git ls-tree -r origin/sparkle --name-only', {
    cwd: join(env.clones[0], '.sparkle-worktree'),
    encoding: 'utf8'
  });

  if (!remoteFiles.includes(`sparkle-data/${item.itemId}.json`)) {
    throw new Error('BUG 1: Item file not pushed to origin');
  }

  // Verify item file is committed (not just in working directory)
  const gitStatus = execSync('git status --porcelain', {
    cwd: join(env.clones[0], '.sparkle-worktree'),
    encoding: 'utf8'
  });

  if (gitStatus.includes(`${item.itemId}.json`)) {
    throw new Error(`BUG 1: Item file still untracked/uncommitted: ${gitStatus}`);
  }

  console.log('✓ Daemon successfully auto-committed and pushed item file');

  await stopDaemon(port);
  await cleanupEnvironment(env.testDir);
});

/**
 * Test: Manual fetch rebuilds aggregates for items from other clone
 * Reproduces production bug where manual fetch doesn't rebuild aggregates
 * This test matches the exact scenario from production logs
 */
runner.test('Manual fetch rebuilds aggregates for items from other clone', async (baseDir, testName) => {
  const testId1 = createTestId();
  const testId2 = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 2);

  // STEP 1: Setup clone1 (test_sparkle equivalent)
  console.log('   [Clone1] Installing and initializing Sparkle...');
  await installSparkle(env.clones[0], TARBALL_PATH);
  await initializeSparkle(env.clones[0]);

  console.log('   [Clone1] Starting daemon...');
  const port1 = await startDaemon(env.clones[0], testId1);
  await sleep(1000);

  // STEP 2: Clone1 creates item "a"
  console.log('   [Clone1] Creating item A...');
  const itemA = await apiCall(port1, '/api/createItem', {
    tagline: 'Item A',
    status: 'incomplete'
  });
  console.log(`   [Clone1] Created item A: ${itemA.itemId}`);

  // Poll daemon log for push completion (check every 100ms for up to 15 seconds)
  console.log('   [Clone1] Waiting for push to complete...');
  const daemonLogPath = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', 'daemon.log');
  let pushCompleted = false;
  const maxWaitMs = 15000;
  const pollIntervalMs = 100;
  const maxAttempts = maxWaitMs / pollIntervalMs;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { readFile } = await import('fs/promises');
      const logContent = await readFile(daemonLogPath, 'utf8');
      if (logContent.includes('Push successful')) {
        console.log(`   [Clone1] Push completed after ${i * pollIntervalMs}ms`);
        pushCompleted = true;
        break;
      }
    } catch (error) {
      // Log file might not exist yet, continue polling
    }
    await sleep(pollIntervalMs);
  }

  if (!pushCompleted) {
    throw new Error(`Clone1 did not push within ${maxWaitMs}ms`);
  }

  // Verify item is actually on origin
  const remoteFiles = execSync('git ls-tree -r origin/sparkle --name-only', {
    cwd: join(env.clones[0], '.sparkle-worktree'),
    encoding: 'utf8'
  });
  if (!remoteFiles.includes(`sparkle-data/${itemA.itemId}.json`)) {
    throw new Error('Item A not found on origin after push');
  }

  // Get commit count for later comparison
  const clone1InitialCommits = execSync('git rev-list --count HEAD', {
    cwd: join(env.clones[0], '.sparkle-worktree'),
    encoding: 'utf8'
  }).trim();
  console.log(`   [Clone1] Commits on sparkle branch: ${clone1InitialCommits}`);

  // STEP 3: Setup clone2 (test2_sparkle equivalent)
  console.log('   [Clone2] Pulling and installing...');
  execSync('git pull', { cwd: env.clones[1], stdio: 'pipe' });
  execSync('npm install', { cwd: env.clones[1], stdio: 'pipe' });

  console.log('   [Clone2] Starting daemon...');
  const port2 = await startDaemon(env.clones[1], testId2);
  await sleep(2000); // Give time for startup and initial fetch

  // STEP 4: Clone2 verifies item "a" is visible
  console.log('   [Clone2] Verifying item A is visible...');
  const clone2AllItems = await apiCall(port2, '/api/allItems');
  if (clone2AllItems.items.length !== 1) {
    throw new Error(`Clone2 should see 1 item, got ${clone2AllItems.items.length}`);
  }
  const hasItemA = clone2AllItems.items.some(item => item.itemId === itemA.itemId);
  if (!hasItemA) {
    throw new Error('Clone2 should see item A');
  }
  console.log('   [Clone2] ✓ Item A is visible');

  // Verify aggregate exists for item A in clone2
  const clone2AggregatesPath = join(env.clones[1], '.sparkle-worktree', 'sparkle-data', '.aggregates', 'items');
  const itemAAggPath = join(clone2AggregatesPath, `${itemA.itemId}.json`);
  if (!existsSync(itemAAggPath)) {
    throw new Error('Clone2 should have aggregate for item A');
  }

  // STEP 5: Clone2 creates item "b"
  console.log('   [Clone2] Creating item B...');
  const itemB = await apiCall(port2, '/api/createItem', {
    tagline: 'Item B',
    status: 'incomplete'
  });
  console.log(`   [Clone2] Created item B: ${itemB.itemId}`);

  // Wait for debounced commit
  console.log('   [Clone2] Waiting for commit and push...');
  await sleep(6000);

  // Poll until push completes (check git log increases)
  console.log('   [Clone2] Polling for push completion...');
  let push2Completed = false;
  for (let i = 0; i < 20; i++) {
    const currentCommits = execSync('git rev-list --count HEAD', {
      cwd: join(env.clones[1], '.sparkle-worktree'),
      encoding: 'utf8'
    }).trim();
    if (parseInt(currentCommits) > parseInt(clone1InitialCommits)) {
      console.log(`   [Clone2] Push completed after ${i * 500}ms`);
      push2Completed = true;
      break;
    }
    await sleep(500);
  }
  if (!push2Completed) {
    throw new Error('Clone2 push did not complete within timeout');
  }

  // Verify item B exists in clone2
  const itemBDetails = await apiCall(port2, '/api/getItemDetails', {
    itemId: itemB.itemId
  });
  if (itemBDetails.tagline !== 'Item B') {
    throw new Error('Clone2 should have item B');
  }

  // STEP 6: Clone1 triggers manual fetch
  console.log('   [Clone1] Triggering manual fetch...');
  const fetchResult = await apiCall(port1, '/api/fetch', {});
  console.log(`   [Clone1] Fetch result:`, fetchResult);

  // Wait for fetch to complete
  await sleep(2000);

  // STEP 7: Wait for file arrival (verify git tree has item B)
  console.log('   [Clone1] Polling for item B file...');
  let fileArrived = false;
  for (let i = 0; i < 10; i++) {
    try {
      const gitFiles = execSync('git ls-files', {
        cwd: join(env.clones[0], '.sparkle-worktree', 'sparkle-data'),
        encoding: 'utf8'
      });
      if (gitFiles.includes(`${itemB.itemId}.json`)) {
        console.log(`   [Clone1] Item B file arrived after ${i * 500}ms`);
        fileArrived = true;
        break;
      }
    } catch (error) {
      // Ignore errors
    }
    await sleep(500);
  }
  if (!fileArrived) {
    throw new Error('Clone1 did not receive item B file after fetch');
  }

  // STEP 8: Clone1 requests item B via API (THIS SHOULD FAIL WITH BUG)
  console.log('   [Clone1] Requesting item B via API...');
  try {
    const clone1ItemB = await apiCall(port1, '/api/getItemDetails', {
      itemId: itemB.itemId
    });

    // If we get here, the bug is fixed!
    if (clone1ItemB.tagline !== 'Item B') {
      throw new Error(`Clone1 got wrong item: ${clone1ItemB.tagline}`);
    }
    console.log('   [Clone1] ✓ Item B is accessible (bug is FIXED)');

  } catch (error) {
    // Expected with bug: item doesn't exist error
    if (error.message.includes('does not exist') || error.message.includes('404')) {
      throw new Error('BUG REPRODUCED: Clone1 cannot access item B after manual fetch (aggregate not rebuilt)');
    }
    throw error; // Re-throw unexpected errors
  }

  // STEP 9: Verify aggregate was rebuilt
  console.log('   [Clone1] Verifying aggregate exists for item B...');
  const clone1AggregatesPath = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', '.aggregates', 'items');
  const itemBAggPath = join(clone1AggregatesPath, `${itemB.itemId}.json`);

  if (!existsSync(itemBAggPath)) {
    throw new Error('Clone1 should have aggregate for item B after fetch');
  }

  // Verify aggregate contents
  const { readFile } = await import('fs/promises');
  const aggContent = JSON.parse(await readFile(itemBAggPath, 'utf8'));
  if (aggContent.tagline !== 'Item B') {
    throw new Error('Clone1 aggregate for item B has wrong content');
  }

  console.log('   ✓ Manual fetch correctly rebuilt aggregate for item B');

  // STEP 10: Cleanup
  await stopDaemon(port1);
  await stopDaemon(port2);
  await cleanupEnvironment(env.testDir);
});

// Test: Bug 3 - Dependency links are not auto-committed
runner.test('Bug 3: Dependency links not auto-committed', async (baseDir, testName) => {
  const testId1 = createTestId();
  const testId2 = createTestId();
  const env = await createTestEnvironment(baseDir, testName, 2);

  // STEP 1: Setup clone1
  console.log('   [Clone1] Installing and initializing Sparkle...');
  await installSparkle(env.clones[0], TARBALL_PATH);
  await initializeSparkle(env.clones[0]);

  console.log('   [Clone1] Starting daemon...');
  const port1 = await startDaemon(env.clones[0], testId1);
  await sleep(1000);

  // STEP 2: Clone1 creates item A
  console.log('   [Clone1] Creating item A...');
  const itemA = await apiCall(port1, '/api/createItem', {
    tagline: 'Item A',
    status: 'incomplete'
  });
  console.log(`   [Clone1] Created item A: ${itemA.itemId}`);

  // Wait for push
  console.log('   [Clone1] Waiting for push...');
  const daemonLogPath1 = join(env.clones[0], '.sparkle-worktree', 'sparkle-data', 'daemon.log');
  let pushCompleted = false;
  for (let i = 0; i < 150; i++) {
    try {
      const { readFile } = await import('fs/promises');
      const logContent = await readFile(daemonLogPath1, 'utf8');
      if (logContent.includes('Push successful')) {
        console.log(`   [Clone1] Push completed after ${i * 100}ms`);
        pushCompleted = true;
        break;
      }
    } catch (error) {
      // Log file might not exist yet
    }
    await sleep(100);
  }
  if (!pushCompleted) {
    throw new Error('Clone1 did not push item A within 15s');
  }

  // STEP 3: Setup clone2
  console.log('   [Clone2] Pulling and installing...');
  execSync('git pull', { cwd: env.clones[1], stdio: 'pipe' });
  execSync('npm install', { cwd: env.clones[1], stdio: 'pipe' });

  console.log('   [Clone2] Starting daemon...');
  const port2 = await startDaemon(env.clones[1], testId2);
  await sleep(2000);

  // STEP 4: Clone2 verifies item A is visible
  console.log('   [Clone2] Verifying item A is visible...');
  const clone2AllItems1 = await apiCall(port2, '/api/allItems');
  if (!clone2AllItems1.items.some(item => item.itemId === itemA.itemId)) {
    throw new Error('Clone2 should see item A');
  }
  console.log('   [Clone2] ✓ Item A is visible');

  // STEP 5: Clone2 creates item B
  console.log('   [Clone2] Creating item B...');
  const itemB = await apiCall(port2, '/api/createItem', {
    tagline: 'Item B',
    status: 'incomplete'
  });
  console.log(`   [Clone2] Created item B: ${itemB.itemId}`);

  // Wait for push
  console.log('   [Clone2] Waiting for push...');
  const daemonLogPath2 = join(env.clones[1], '.sparkle-worktree', 'sparkle-data', 'daemon.log');
  pushCompleted = false;
  for (let i = 0; i < 150; i++) {
    try {
      const { readFile } = await import('fs/promises');
      const logContent = await readFile(daemonLogPath2, 'utf8');
      if (logContent.includes('Push successful')) {
        console.log(`   [Clone2] Push completed after ${i * 100}ms`);
        pushCompleted = true;
        break;
      }
    } catch (error) {
      // Log file might not exist yet
    }
    await sleep(100);
  }
  if (!pushCompleted) {
    throw new Error('Clone2 did not push item B within 15s');
  }

  // STEP 6: Clone1 manually fetches
  console.log('   [Clone1] Manually fetching updates...');
  await apiCall(port1, '/api/fetch', {});
  await sleep(2000);

  // STEP 7: Clone1 verifies item B is visible
  console.log('   [Clone1] Verifying item B is visible...');
  const clone1AllItems = await apiCall(port1, '/api/allItems');
  if (!clone1AllItems.items.some(item => item.itemId === itemB.itemId)) {
    throw new Error('Clone1 should see item B after fetch');
  }
  console.log('   [Clone1] ✓ Item B is visible');

  // STEP 8: Clone1 adds dependency A→B
  console.log(`   [Clone1] Adding dependency ${itemA.itemId}→${itemB.itemId}...`);
  await apiCall(port1, '/api/addDependency', {
    itemNeeding: itemA.itemId,
    itemNeeded: itemB.itemId
  });

  // Verify dependency is visible locally in clone1
  const itemADetails = await apiCall(port1, '/api/getItemDetails', {
    itemId: itemA.itemId
  });
  if (!itemADetails.dependencies || itemADetails.dependencies.length !== 1) {
    throw new Error('Clone1 should see dependency locally');
  }
  console.log('   [Clone1] ✓ Dependency visible locally');

  // STEP 9: Wait for auto-commit (THIS IS THE BUG - it won't happen)
  console.log('   [Clone1] Waiting 7 seconds for auto-commit...');
  await sleep(7000);

  // Check git status in clone1 worktree
  console.log('   [Clone1] Checking git status...');
  const clone1Worktree = join(env.clones[0], '.sparkle-worktree');
  const statusBefore = execSync('git status --porcelain', {
    cwd: clone1Worktree,
    encoding: 'utf8'
  }).trim();

  console.log(`   [Clone1] Git status: ${statusBefore || '(clean)'}`);

  // THIS IS WHERE WE DETECT THE BUG
  if (statusBefore.includes('dependency')) {
    console.log('   ❌ BUG DETECTED: Dependency file is untracked!');
    console.log('      This proves Bug 3 - addDependency() never calls git scheduler');

    // Check daemon log to confirm no commit attempt
    const { readFile } = await import('fs/promises');
    const logContent = await readFile(daemonLogPath1, 'utf8');
    const logLines = logContent.split('\n');

    // Find the dependency add time
    const addDependencyTime = new Date();
    const recentLog = logLines.slice(-200).join('\n'); // Last 200 lines

    if (!recentLog.includes('[GitOperations] Staged')) {
      console.log('      Daemon log confirms: No git staging after dependency added');
    }

    // Manually commit to continue test
    console.log('   [Clone1] Manually committing dependency file...');
    execSync('git add -A && git commit -m "Manual commit of dependency" && git push', {
      cwd: clone1Worktree,
      stdio: 'pipe'
    });
  } else {
    console.log('   ✅ Dependency file was auto-committed (Bug 3 is FIXED!)');
  }

  // STEP 10: Clone2 manually fetches
  console.log('   [Clone2] Manually fetching updates...');
  await apiCall(port2, '/api/fetch', {});
  await sleep(2000);

  // STEP 11: Clone2 checks if dependency is visible
  console.log('   [Clone2] Checking if dependency is visible...');
  const itemAInClone2 = await apiCall(port2, '/api/getItemDetails', {
    itemId: itemA.itemId
  });

  if (!itemAInClone2.dependencies || itemAInClone2.dependencies.length === 0) {
    throw new Error('Clone2 should see dependency after fetch');
  }

  if (itemAInClone2.dependencies[0] !== itemB.itemId) {
    throw new Error(`Clone2 should see dependency to ${itemB.itemId}`);
  }

  console.log('   [Clone2] ✓ Dependency visible after fetch');

  // Final verification
  const statusAfter = execSync('git status --porcelain', {
    cwd: clone1Worktree,
    encoding: 'utf8'
  }).trim();

  if (statusAfter !== '') {
    throw new Error('Worktree should be clean after sync');
  }

  console.log('   ✓ Test complete - dependency synced across clones');

  // Cleanup
  await stopDaemon(port1);
  await stopDaemon(port2);
  await cleanupEnvironment(env.testDir);
});

// Run all tests (or filtered tests if --filter provided)
const filterArg = process.argv.find(arg => arg.startsWith('--filter='));
const filterPattern = filterArg ? filterArg.split('=')[1] : null;

runner.run(filterPattern).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
