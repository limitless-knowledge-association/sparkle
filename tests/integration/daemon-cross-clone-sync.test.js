/**
 * Daemon-Based Cross-Clone Synchronization Tests
 *
 * Tests that validate multi-clone collaborative workflows using daemons
 * that handle automatic git synchronization (fetch/pull/commit/push).
 *
 * These tests validate:
 * 1. Data visibility across clones (daemon periodic fetch/pull)
 * 2. Concurrent modifications merge correctly (event-sourcing assumption)
 * 3. Aggregate cache invalidation after daemon pulls remote changes
 */

import { join } from 'path';
import { readFile } from 'fs/promises';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import {
  createTestEnvironment,
  installSparkle,
  initializeSparkle,
  startDaemon,
  stopDaemon,
  createTestId,
  startLogServer
} from '../helpers/test-helpers.js';
import { makeApiRequest, triggerFetchAndWait } from '../../src/daemonClient.js';

const execAsync = promisify(execCallback);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Get tarball path for current version
async function getTarballPath() {
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  return join(process.cwd(), `sparkle-${version}.tgz`);
}

describe('Daemon Cross-Clone Synchronization', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'daemon-cross-clone-tests');
  let logServerPort;
  let tarballPath;

  beforeAll(async () => {
    // Ensure baseDir exists before starting log server
    const { mkdir } = await import('fs/promises');
    await mkdir(baseDir, { recursive: true });

    // Start log server (testId, baseDir)
    const testId = 'daemon-cross-clone-sync';
    logServerPort = await startLogServer(testId, baseDir);
    console.log(`Log server started on port ${logServerPort}`);

    // Get tarball path
    tarballPath = await getTarballPath();
  });

  describe('Basic cross-clone data visibility', () => {
    test('daemon in clone2 automatically sees item created in clone1', async () => {
      const testId = createTestId();
      const testName = 'test-daemon-visibility';

      // Create test environment with 2 clones
      console.log('\n📦 Creating test environment...');
      const env = await createTestEnvironment(baseDir, testName, 2, testId);
      const clone1Path = env.clones[0];
      const clone2Path = env.clones[1];

      try {
        // === SETUP CLONE 1 ===
        console.log('\n🔧 Setting up clone1...');
        await installSparkle(clone1Path, tarballPath);
        await initializeSparkle(clone1Path);

        // Start daemon in clone1
        const port1 = await startDaemon(clone1Path, `${testId}-clone1`);
        console.log(`✓ Clone1 daemon started on port ${port1}`);

        // Wait for daemon to initialize and push sparkle branch
        await sleep(2000);

        // === CREATE ITEM IN CLONE 1 ===
        console.log('\n✏️  Creating item in clone1...');
        const createResult = await makeApiRequest(port1, '/api/createItem', 'POST', {
          tagline: 'Item from clone1',
          status: 'incomplete'
        });
        const itemId = createResult.itemId;
        console.log(`✓ Created item: ${itemId}`);

        // Wait for daemon to commit and push (debounce + commit time)
        console.log('⏳ Waiting for clone1 daemon to commit and push...');
        await sleep(8000);

        // === SETUP CLONE 2 ===
        console.log('\n🔧 Setting up clone2...');
        // Pull to get tarball and package.json from clone1
        await execAsync('git pull', { cwd: clone2Path });
        await execAsync('npm install', { cwd: clone2Path });

        // Start daemon in clone2 (will detect sparkle branch and set up worktree)
        const port2 = await startDaemon(clone2Path, `${testId}-clone2`);
        console.log(`✓ Clone2 daemon started on port ${port2}`);

        // === TRIGGER CLONE 2 TO FETCH ===
        // Clone2 daemon will fetch and see clone1's item
        console.log('🔄 Triggering fetch on clone2...');
        await triggerFetchAndWait(port2);

        // === VERIFY ITEM VISIBLE IN CLONE 2 ===
        console.log('\n🔍 Checking if clone2 can see item...');
        const item = await makeApiRequest(port2, '/api/getItemDetails', 'POST', { itemId });

        expect(item.itemId).toBe(itemId);
        expect(item.tagline).toBe('Item from clone1');
        console.log('✅ Clone2 daemon successfully sees item from clone1!');

        // Cleanup
        await stopDaemon(port1);
        await stopDaemon(port2);

      } catch (error) {
        console.error('❌ Test failed:', error.message);
        throw error;
      }
    }, 120000); // 2 minute timeout
  });

  describe('Concurrent modifications', () => {
    test('concurrent entries from different clones merge correctly', async () => {
      const testId = createTestId();
      const testName = 'test-daemon-concurrent';

      console.log('\n📦 Creating test environment...');
      const env = await createTestEnvironment(baseDir, testName, 2, testId);
      const clone1Path = env.clones[0];
      const clone2Path = env.clones[1];

      try {
        // === SETUP BOTH CLONES ===
        console.log('\n🔧 Setting up clone1...');
        await installSparkle(clone1Path, tarballPath);
        await initializeSparkle(clone1Path);
        const port1 = await startDaemon(clone1Path, `${testId}-clone1`);
        console.log(`✓ Clone1 daemon started on port ${port1}`);

        await sleep(2000);

        console.log('\n🔧 Setting up clone2...');
        await execAsync('git pull', { cwd: clone2Path });
        await execAsync('npm install', { cwd: clone2Path });
        const port2 = await startDaemon(clone2Path, `${testId}-clone2`);
        console.log(`✓ Clone2 daemon started on port ${port2}`);

        await triggerFetchAndWait(port2);

        // === CREATE ITEM IN CLONE 1 ===
        console.log('\n✏️  Creating item in clone1...');
        const createResult = await makeApiRequest(port1, '/api/createItem', 'POST', {
          tagline: 'Shared item',
          status: 'incomplete'
        });
        const itemId = createResult.itemId;
        console.log(`✓ Created item: ${itemId}`);

        await sleep(8000); // Wait for commit/push

        // === WAIT FOR CLONE 2 TO SYNC ===
        console.log('\n⏳ Waiting for clone2 to see the item...');
        await triggerFetchAndWait(port2);

        // === ADD ENTRIES FROM BOTH CLONES CONCURRENTLY ===
        console.log('\n✏️  Adding entries from both clones...');
        await Promise.all([
          makeApiRequest(port1, '/api/addEntry', 'POST', {
            itemId,
            text: 'Entry from clone1'
          }),
          makeApiRequest(port2, '/api/addEntry', 'POST', {
            itemId,
            text: 'Entry from clone2'
          })
        ]);
        console.log('✓ Both entries added');

        // Wait for both to commit/push
        await sleep(8000);

        // === WAIT FOR SYNC (both directions) ===
        console.log('\n⏳ Waiting for bidirectional sync...');
        // Trigger fetch on both clones to sync bidirectionally
        await Promise.all([
          triggerFetchAndWait(port1),
          triggerFetchAndWait(port2)
        ]);

        // Force aggregate rebuild to pick up merged changes
        await makeApiRequest(port1, '/api/internal/aggregateUpdated', 'POST', {
          eventType: 'rebuildAll'
        });
        await sleep(2000);

        // === VERIFY BOTH ENTRIES EXIST ===
        console.log('\n🔍 Verifying both entries merged...');
        const item = await makeApiRequest(port1, '/api/getItemDetails', 'POST', { itemId });

        expect(item.entries).toBeDefined();
        expect(item.entries.length).toBe(2);

        const entryTexts = item.entries.map(e => e.text);
        expect(entryTexts).toContain('Entry from clone1');
        expect(entryTexts).toContain('Entry from clone2');

        console.log('✅ Both concurrent entries merged correctly!');

        // Cleanup
        await stopDaemon(port1);
        await stopDaemon(port2);

      } catch (error) {
        console.error('❌ Test failed:', error.message);
        throw error;
      }
    }, 180000); // 3 minute timeout
  });

  describe('Aggregate cache invalidation', () => {
    test('daemon invalidates aggregate cache after pulling remote changes', async () => {
      const testId = createTestId();
      const testName = 'test-daemon-invalidation';

      console.log('\n📦 Creating test environment...');
      const env = await createTestEnvironment(baseDir, testName, 2, testId);
      const clone1Path = env.clones[0];
      const clone2Path = env.clones[1];

      try {
        // === SETUP BOTH CLONES ===
        console.log('\n🔧 Setting up clone1...');
        await installSparkle(clone1Path, tarballPath);
        await initializeSparkle(clone1Path);
        const port1 = await startDaemon(clone1Path, `${testId}-clone1`);
        console.log(`✓ Clone1 daemon started on port ${port1}`);

        await sleep(2000);

        console.log('\n🔧 Setting up clone2...');
        await execAsync('git pull', { cwd: clone2Path });
        await execAsync('npm install', { cwd: clone2Path });
        const port2 = await startDaemon(clone2Path, `${testId}-clone2`);
        console.log(`✓ Clone2 daemon started on port ${port2}`);

        await triggerFetchAndWait(port2);

        // === CREATE AND MODIFY ITEM IN CLONE 1 ===
        console.log('\n✏️  Creating item in clone1...');
        const createResult = await makeApiRequest(port1, '/api/createItem', 'POST', {
          tagline: 'Original tagline',
          status: 'incomplete'
        });
        const itemId = createResult.itemId;
        console.log(`✓ Created item: ${itemId}`);

        await sleep(8000); // Wait for commit/push

        console.log('✏️  Updating tagline in clone1...');
        await makeApiRequest(port1, '/api/alterTagline', 'POST', {
          itemId,
          tagline: 'Updated tagline'
        });
        console.log('✓ Tagline updated');

        await sleep(8000); // Wait for commit/push

        // === WAIT FOR CLONE 2 TO SYNC ===
        console.log('\n⏳ Waiting for clone2 daemon to pull changes...');
        await triggerFetchAndWait(port2);

        // === VERIFY CLONE 2 SEES UPDATED DATA ===
        console.log('\n🔍 Checking if clone2 sees updated tagline...');
        const item = await makeApiRequest(port2, '/api/getItemDetails', 'POST', { itemId });

        expect(item.itemId).toBe(itemId);
        expect(item.tagline).toBe('Updated tagline');
        console.log('✅ Clone2 daemon correctly invalidated cache and shows updated data!');

        // Cleanup
        await stopDaemon(port1);
        await stopDaemon(port2);

      } catch (error) {
        console.error('❌ Test failed:', error.message);
        throw error;
      }
    }, 180000); // 3 minute timeout
  });
});
