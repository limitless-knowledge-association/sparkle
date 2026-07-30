/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * RED tests (fail today, pass after the daemon-unification refactor).
 *
 * Target behavior being locked in:
 *   - COMMIT is immediate per mutation: local, always safe, works offline.
 *   - PUSH is debounced (~5s) AND best-effort: offline / failure is non-fatal and deferred.
 *   - On startup the daemon reconciles (pull + push), flushing commits stranded while offline.
 *
 * We inspect the bare repo directly for the authoritative "remote" SHA, and the worktree
 * for the local SHA, so we don't depend on fetch timing.
 */

import { join } from 'path';
import { readFile, mkdir } from 'fs/promises';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import {
  createTestEnvironment,
  installSparkle,
  initializeSparkle,
  getTarballPath,
  startDaemon,
  stopDaemon,
  startLogServer, stopLogServer,
  createTestId,
  cleanupEnvironment,
  sleep
} from '../helpers/test-helpers.js';
import { makeApiRequest } from '../../src/daemonClient.js';

const execAsync = promisify(execCallback);
const git = async (args, cwd) => (await execAsync(`git ${args}`, { cwd })).stdout.trim();

const DEBOUNCE_MS = 5000;

describe('Commit-immediately / push-debounced / offline-safe (RED until refactor)', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'debounce');
  const ctx = {};

  beforeAll(async () => {
    await mkdir(baseDir, { recursive: true });
    await startLogServer('debounce', baseDir);
    const testId = createTestId();
    const env = await createTestEnvironment(baseDir, 'debounce', 1, testId);
    ctx.env = env;
    ctx.clone = env.clones[0];
    ctx.bare = env.bareRepo;

    await installSparkle(ctx.clone, await getTarballPath());
    await initializeSparkle(ctx.clone);

    const pkg = JSON.parse(await readFile(join(ctx.clone, 'package.json'), 'utf8'));
    const { git_branch, directory, worktree_path = '.sparkle-worktree' } = pkg.sparkle_config;
    ctx.branch = git_branch;
    ctx.worktree = join(ctx.clone, worktree_path);
    ctx.directory = directory;

    ctx.port = await startDaemon(ctx.clone, `${testId}-d`);
    // Let the daemon finish its own startup commits/pushes before we measure.
    await sleep(4000);
  }, 240000);

  afterAll(async () => {
    await stopLogServer(); // open HTTP handle; leaking it hangs isolated runs
    if (ctx.port) await stopDaemon(ctx.port).catch(() => {});
    if (ctx.env) await cleanupEnvironment(ctx.env.testDir);
  }, 60000);

  const localHead = () => git('rev-parse HEAD', ctx.worktree);
  const remoteHead = () => git(`rev-parse ${ctx.branch}`, ctx.bare);

  test('mutation commits immediately but defers the push (debounced)', async () => {
    const local0 = await localHead();
    const remote0 = await remoteHead();

    // Perform a mutation through the daemon.
    const { itemId } = await makeApiRequest(ctx.port, '/api/createItem', 'POST', {
      tagline: 'debounce probe', status: 'incomplete'
    });
    expect(itemId).toMatch(/^\d{8}$/);

    // Immediately (well within the push debounce window): the commit must already exist
    // locally, while the remote must NOT have advanced yet.
    const localImmediate = await localHead();
    const remoteImmediate = await remoteHead();
    expect(localImmediate).not.toBe(local0);          // committed immediately  (RED now)
    expect(remoteImmediate).toBe(remote0);            // push still pending (debounced)

    // After the debounce window elapses, the push flushes and the remote catches up.
    await sleep(DEBOUNCE_MS + 4000);
    const remoteLater = await remoteHead();
    expect(remoteLater).toBe(localImmediate);         // pushed after debounce
  }, 120000);

  test('offline: still commits locally, and the next daemon start flushes the push', async () => {
    const local0 = await localHead();

    // Simulate offline by pointing the worktree remote at a nonexistent path so push/fetch fail.
    const bogus = join(ctx.env.testDir, 'nonexistent-remote.git');
    await git(`remote set-url origin ${bogus}`, ctx.worktree);

    // Mutate while "offline". The call must succeed (best-effort push, non-fatal)...
    await makeApiRequest(ctx.port, '/api/addEntry', 'POST', {
      itemId: (await makeApiRequest(ctx.port, '/api/createItem', 'POST', {
        tagline: 'offline probe', status: 'incomplete'
      })).itemId,
      text: 'written while offline'
    });

    // ...and the change must be committed locally despite the dead remote.
    await sleep(DEBOUNCE_MS + 3000); // allow any push attempt to fail
    const localOffline = await localHead();
    expect(localOffline).not.toBe(local0);            // committed offline (RED now)

    // Remote (real bare) must not have advanced — nothing was pushed.
    // (remoteHead reads the bare repo, which the daemon couldn't reach.)
    // Now come back "online" and restart the daemon; startup reconciliation must flush.
    await git(`remote set-url origin ${ctx.bare}`, ctx.worktree);
    await stopDaemon(ctx.port).catch(() => {});
    ctx.port = await startDaemon(ctx.clone, `restart-${Date.now()}`);

    // Poll for the startup push to flush the stranded local commit to the remote.
    let flushed = false;
    for (let i = 0; i < 40; i++) {
      if ((await remoteHead()) === localOffline) { flushed = true; break; }
      await sleep(1000);
    }
    expect(flushed).toBe(true);                        // startup pull+push reconciliation (RED now)
  }, 180000);
});
