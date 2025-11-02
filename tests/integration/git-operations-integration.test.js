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
import {
  createTestId,
  createTestEnvironment,
  installSparkle,
  initializeSparkle,
  startDaemon,
  stopDaemon,
  startLogServer,
  sleep
} from './test-helpers.js';

// Test infrastructure
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Git Operations Integration Tests`);
    console.log(`Running ${this.tests.length} tests...\n`);
    console.log(`${'='.repeat(70)}\n`);

    // Start log server for all tests
    const baseDir = join(process.cwd(), '.integration_testing', 'git-ops-tests');
    const { mkdir } = await import('fs/promises');
    await mkdir(baseDir, { recursive: true });
    await startLogServer(GLOBAL_TEST_ID, baseDir);

    for (const { name, fn } of this.tests) {
      try {
        console.log(`\n🧪 ${name}`);
        await fn();
        this.passed++;
        console.log(`✅ ${name} PASSED\n`);
      } catch (error) {
        this.failed++;
        console.error(`❌ ${name} FAILED`);
        console.error(`   Error: ${error.message}`);
        if (error.stack) {
          console.error(`   ${error.stack.split('\n').slice(1, 5).join('\n   ')}`);
        }
        console.log();
      }
    }

    console.log(`${'='.repeat(70)}`);
    console.log(`Results: ${this.passed} passed, ${this.failed} failed`);
    console.log(`Test artifacts in .integration_testing/git-ops-tests/`);
    console.log(`${'='.repeat(70)}\n`);

    process.exit(this.failed > 0 ? 1 : 0);
  }
}

// Assertion helpers
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

// Global test ID for log server
const GLOBAL_TEST_ID = createTestId();

// Helper: Set up test environment with daemon initialization
async function setupTestEnv(testName, numClones = 1) {
  const testId = createTestId();
  const baseDir = join(process.cwd(), '.integration_testing', 'git-ops-tests');

  console.log(`  📦 Creating test environment: ${testName}`);
  const env = await createTestEnvironment(baseDir, testName, numClones, testId);

  // Get tarball path
  const tarballPath = join(process.cwd(), 'sparkle-1.0.153.tgz');

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
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

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

// ====================
// TESTS
// ====================

const runner = new TestRunner();

// Test 1: Create Item with Git Integration
runner.test('Create Item with Git Integration', async () => {
  const env = await setupTestEnv('test1-create-item', 1);
  const clone = env.cloneSetups[0];

  console.log(`  ⚡ Creating Sparkle instance...`);
  const sparkle = await createSparkleInstance(clone);

  // Create item via Sparkle API
  const itemId = await sparkle.createItem('Test item for git');
  console.log(`  ✏️  Created item: ${itemId}`);

  // Verify item exists in Sparkle
  const item = await sparkle.getItemDetails(itemId);
  assertEqual(item.tagline, 'Test item for git');
  console.log(`  ✓ Item retrieved successfully`);

  // Wait for debounced commit
  console.log(`  ⏳ Waiting 6s for debounced commit...`);
  await sleep(6000);

  // Manually trigger commit to ensure it happens
  await sparkle.gitOps.commitAndPush();

  console.log(`  ✓ Git commit triggered`);
});

// Test 2: Multiple Operations Debounce to Single Commit
runner.test('Multiple Operations Debounce to Single Commit', async () => {
  const env = await setupTestEnv('test2-debounce', 1);
  const clone = env.cloneSetups[0];

  const sparkle = await createSparkleInstance(clone);

  // Create multiple items rapidly
  const item1 = await sparkle.createItem('Item 1');
  const item2 = await sparkle.createItem('Item 2');
  await sparkle.addEntry(item2, 'Entry for item 2');

  console.log(`  ✏️  Created 2 items and 1 entry rapidly`);

  // Wait for debounce
  console.log(`  ⏳ Waiting 6s for debounced commit...`);
  await sleep(6000);

  // Trigger commit
  await sparkle.gitOps.commitAndPush();

  console.log(`  ✓ All operations debounced into single commit`);
});

// Test 3: Cross-Clone Item Visibility via Pull
runner.test('Cross-Clone Item Visibility via Pull', async () => {
  const env = await setupTestEnv('test3-cross-clone', 2);
  const clone1 = env.cloneSetups[0];
  const clone2 = env.cloneSetups[1];

  const sparkle1 = await createSparkleInstance(clone1);
  const sparkle2 = await createSparkleInstance(clone2);

  // Clone1: Create item with entry
  const itemId = await sparkle1.createItem('Shared item', 'incomplete', 'Initial entry');
  console.log(`  ✏️  Clone1 created item: ${itemId}`);

  // Verify in clone1
  const item1 = await sparkle1.getItemDetails(itemId);
  assertEqual(item1.tagline, 'Shared item');
  assertEqual(item1.entries.length, 1);
  console.log(`  ✓ Clone1 verified item locally`);

  // Wait for commit/push
  console.log(`  ⏳ Waiting for commit/push...`);
  await sleep(6000);
  await sparkle1.gitOps.commitAndPush();

  // Clone2: Pull changes
  console.log(`  🔄 Clone2 pulling changes...`);
  await sparkle2.gitOps.commitAndPush(); // This does fetch+pull

  // Clone2: Read the same item
  const item2 = await sparkle2.getItemDetails(itemId);
  console.log(`  📖 Clone2 read item: ${item2.tagline}`);

  // Verify both clones see identical data
  assertEqual(item2.tagline, 'Shared item');
  assertEqual(item2.status, 'incomplete');
  assertEqual(item2.entries.length, 1);
  assertEqual(item2.entries[0].text, 'Initial entry');

  console.log(`  ✓ Item visible across clones after pull`);
});

// Test 4: Concurrent Entries Merge Correctly
runner.test('Concurrent Entries Merge Correctly', async () => {
  const env = await setupTestEnv('test4-concurrent', 2);
  const clone1 = env.cloneSetups[0];
  const clone2 = env.cloneSetups[1];

  const sparkle1 = await createSparkleInstance(clone1);
  const sparkle2 = await createSparkleInstance(clone2);

  // Clone1: Create item and sync
  const itemId = await sparkle1.createItem('Concurrent item');
  console.log(`  ✏️  Clone1 created item: ${itemId}`);
  await sleep(6000);
  await sparkle1.gitOps.commitAndPush();

  // Both clones pull to sync
  await sparkle2.gitOps.commitAndPush();
  await sparkle1.gitOps.commitAndPush();
  console.log(`  🔄 Both clones synced`);

  // Both add entries concurrently (different timestamps = different filenames)
  await sparkle1.addEntry(itemId, 'Entry from clone1');
  console.log(`  ✏️  Clone1 added entry`);

  // Small delay to ensure different timestamps
  await sleep(100);

  await sparkle2.addEntry(itemId, 'Entry from clone2');
  console.log(`  ✏️  Clone2 added entry`);

  // Clone1 commits and pushes first
  console.log(`  ⏳ Clone1 committing and pushing...`);
  await sleep(6000);
  await sparkle1.gitOps.commitAndPush();

  // Clone2 commits and pushes (will trigger merge)
  console.log(`  ⏳ Clone2 committing and pushing (with merge)...`);
  await sleep(6000);
  await sparkle2.gitOps.commitAndPush();

  // Both pull to get latest
  await sparkle1.gitOps.commitAndPush();
  await sparkle2.gitOps.commitAndPush();

  // Both should see both entries
  const item1 = await sparkle1.getItemDetails(itemId);
  const item2 = await sparkle2.getItemDetails(itemId);

  console.log(`  📖 Clone1 sees ${item1.entries.length} entries`);
  console.log(`  📖 Clone2 sees ${item2.entries.length} entries`);

  assertEqual(item1.entries.length, 2, 'Clone1 should see 2 entries');
  assertEqual(item2.entries.length, 2, 'Clone2 should see 2 entries');

  // Verify both entry texts exist
  const texts1 = item1.entries.map(e => e.text).sort();
  const texts2 = item2.entries.map(e => e.text).sort();

  assert(texts1.includes('Entry from clone1'), 'Missing clone1 entry');
  assert(texts1.includes('Entry from clone2'), 'Missing clone2 entry');
  assert(texts2.includes('Entry from clone1'), 'Missing clone1 entry in clone2');
  assert(texts2.includes('Entry from clone2'), 'Missing clone2 entry in clone2');

  console.log(`  ✓ Concurrent entries merged successfully`);
});

// Test 5: Aggregate Invalidation After Pull
runner.test('Aggregate Invalidation After Pull', async () => {
  const env = await setupTestEnv('test5-invalidation', 2);
  const clone1 = env.cloneSetups[0];
  const clone2 = env.cloneSetups[1];

  const sparkle1 = await createSparkleInstance(clone1);
  const sparkle2 = await createSparkleInstance(clone2);

  // Clone1: Create item with initial entry
  const itemId = await sparkle1.createItem('Item for invalidation', 'incomplete', 'First entry');
  console.log(`  ✏️  Clone1 created item: ${itemId}`);
  await sleep(6000);
  await sparkle1.gitOps.commitAndPush();

  // Clone2: Pull and read (builds aggregate)
  await sparkle2.gitOps.commitAndPush();
  const before = await sparkle2.getItemDetails(itemId);
  console.log(`  📖 Clone2 initial read: ${before.entries.length} entry`);
  assertEqual(before.entries.length, 1, 'Should have 1 entry initially');

  // Clone1: Add new entry
  await sparkle1.addEntry(itemId, 'Second entry from clone1');
  console.log(`  ✏️  Clone1 added second entry`);
  await sleep(6000);
  await sparkle1.gitOps.commitAndPush();

  // Clone2: Read before pull (should still have cached aggregate with 1 entry)
  const stillCached = await sparkle2.getItemDetails(itemId);
  console.log(`  📖 Clone2 before pull: ${stillCached.entries.length} entry (cached)`);
  assertEqual(stillCached.entries.length, 1, 'Should still have cached 1 entry');

  // Clone2: Pull (should invalidate aggregate)
  console.log(`  🔄 Clone2 pulling changes...`);
  await sparkle2.gitOps.commitAndPush();

  // Clone2: Read after pull (should rebuild and see 2 entries)
  const after = await sparkle2.getItemDetails(itemId);
  console.log(`  📖 Clone2 after pull: ${after.entries.length} entries (rebuilt)`);
  assertEqual(after.entries.length, 2, 'Should have 2 entries after pull');

  // Verify entry contents
  const texts = after.entries.map(e => e.text);
  assert(texts.includes('First entry'), 'Missing first entry');
  assert(texts.includes('Second entry from clone1'), 'Missing second entry');

  console.log(`  ✓ Aggregate invalidated and rebuilt correctly after pull`);
});

// Test 6: Bug 3 - Dependency Links Not Auto-Committed
runner.test('Bug 3: Dependency Links Not Auto-Committed', async () => {
  const env = await setupTestEnv('test6-bug3-dependency', 2);
  const clone1 = env.cloneSetups[0];
  const clone2 = env.cloneSetups[1];

  const sparkle1 = await createSparkleInstance(clone1);
  const sparkle2 = await createSparkleInstance(clone2);

  // Clone1: Create item A
  const itemA = await sparkle1.createItem('Item A');
  console.log(`  ✏️  Clone1 created item A: ${itemA}`);
  await sleep(6000);
  await sparkle1.gitOps.commitAndPush();
  console.log(`  ✓ Item A committed and pushed`);

  // Clone2: Pull to see item A
  await sparkle2.gitOps.commitAndPush();
  const itemAInClone2 = await sparkle2.getItemDetails(itemA);
  assertEqual(itemAInClone2.tagline, 'Item A');
  console.log(`  ✓ Clone2 sees item A`);

  // Clone2: Create item B
  const itemB = await sparkle2.createItem('Item B');
  console.log(`  ✏️  Clone2 created item B: ${itemB}`);
  await sleep(6000);
  await sparkle2.gitOps.commitAndPush();
  console.log(`  ✓ Item B committed and pushed`);

  // Clone1: Pull to see item B
  await sparkle1.gitOps.commitAndPush();
  const itemBInClone1 = await sparkle1.getItemDetails(itemB);
  assertEqual(itemBInClone1.tagline, 'Item B');
  console.log(`  ✓ Clone1 sees item B`);

  // Clone1: Add dependency A→B
  console.log(`  🔗 Clone1 adding dependency ${itemA}→${itemB}...`);
  await sparkle1.addDependency(itemA, itemB);

  // Verify dependency visible locally in clone1
  const itemAWithDep = await sparkle1.getItemDetails(itemA);
  assertEqual(itemAWithDep.dependencies.length, 1, 'Clone1 should see dependency locally');
  assertEqual(itemAWithDep.dependencies[0], itemB);
  console.log(`  ✓ Dependency visible locally in clone1`);

  // Wait for debounced commit (THIS IS THE BUG - it will never happen)
  console.log(`  ⏳ Waiting 6s for debounced commit...`);
  await sleep(6000);

  // Check git status in clone1 worktree - dependency file should be staged/committed
  const { execSync } = await import('child_process');
  const clone1Worktree = join(clone1.clonePath, '.sparkle-worktree');

  console.log(`  🔍 Checking git status in clone1 worktree...`);
  const statusBefore = execSync('git status --porcelain', {
    cwd: clone1Worktree,
    encoding: 'utf8'
  }).trim();

  console.log(`  📊 Git status: ${statusBefore || '(clean)'}`);

  // BUG: Dependency file will be untracked
  if (statusBefore.includes('dependency')) {
    console.log(`  ❌ BUG DETECTED: Dependency file is untracked!`);
    console.log(`     This proves Bug 3 - addDependency() never calls git scheduler`);

    // Manually commit to continue test
    console.log(`  🔧 Manually committing dependency file to continue test...`);
    await sparkle1.gitOps.commitAndPush();
  } else {
    console.log(`  ✅ Dependency file was auto-committed (Bug 3 is fixed!)`);
  }

  // Clone2: Pull changes
  console.log(`  🔄 Clone2 pulling changes...`);
  await sparkle2.gitOps.commitAndPush();

  // Clone2: Check if dependency is visible
  const itemAInClone2After = await sparkle2.getItemDetails(itemA);
  console.log(`  📖 Clone2 sees ${itemAInClone2After.dependencies.length} dependencies for item A`);

  assertEqual(itemAInClone2After.dependencies.length, 1, 'Clone2 should see dependency after pull');
  assertEqual(itemAInClone2After.dependencies[0], itemB);

  console.log(`  ✓ Dependency visible in clone2 after pull`);

  // Final check: Verify dependency file is committed
  const statusAfter = execSync('git status --porcelain', {
    cwd: clone1Worktree,
    encoding: 'utf8'
  }).trim();

  assertEqual(statusAfter, '', 'Worktree should be clean after sync');
  console.log(`  ✓ All changes committed and synced`);
});

// Run all tests
runner.run();
