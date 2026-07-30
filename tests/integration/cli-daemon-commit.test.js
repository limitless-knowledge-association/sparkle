/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * RED tests (fail today, pass after the daemon-unification refactor).
 *
 * These pin down the reported production bug and the target architecture:
 *
 *   `npx sparkle create-item ...` currently constructs the Sparkle CLASS directly,
 *   which default-builds GitOperations from the DATA dir instead of the worktree root.
 *   Its `git add sparkle-data/*.json` therefore resolves to
 *   sparkle-data/sparkle-data/*.json, matches nothing, throws, and the throw is
 *   swallowed. Result: the item JSON is written to the right directory but is NEVER
 *   added / committed / pushed, and no daemon is involved.
 *
 * Target (after refactor): every CLI write goes through the daemon, which commits
 * immediately (local, always safe) and pushes best-effort. So the item must end up
 * committed, pushed, and visible to a second clone, and a daemon must be running.
 *
 * We drive the REAL installed CLI binary (not the daemon API) so we exercise the
 * exact code path `npx sparkle` uses.
 */

import { join } from 'path';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import {
  createTestEnvironment,
  installSparkle,
  initializeSparkle,
  getTarballPath,
  createTestId,
  cleanupEnvironment
} from '../helpers/test-helpers.js';

const execAsync = promisify(execCallback);

const git = async (args, cwd) => (await execAsync(`git ${args}`, { cwd })).stdout.trim();
const listJson = async (dir) => {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter(f => f.endsWith('.json')).sort();
};
const ping = (port) => new Promise((resolve) => {
  import('http').then(({ default: http }) => {
    const req = http.get(`http://localhost:${port}/api/ping`, (res) => resolve(res.statusCode === 200));
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
});

describe('CLI writes go through the daemon and are committed + pushed (RED until refactor)', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'cli-daemon-commit');

  // Shared state produced once by beforeAll.
  const ctx = {};

  beforeAll(async () => {
    const testId = createTestId();
    const env = await createTestEnvironment(baseDir, 'cli-create-item', 2, testId);
    ctx.env = env;
    const clone = env.clones[0];
    ctx.clone = clone;

    await installSparkle(clone, await getTarballPath());
    await initializeSparkle(clone);

    // Resolve config-driven paths.
    const pkg = JSON.parse(await readFile(join(clone, 'package.json'), 'utf8'));
    const { git_branch, directory, worktree_path = '.sparkle-worktree' } = pkg.sparkle_config;
    ctx.branch = git_branch;
    ctx.directory = directory;
    ctx.worktree = join(clone, worktree_path);
    ctx.dataDir = join(ctx.worktree, directory);

    // Snapshot state BEFORE running the CLI.
    ctx.jsonBefore = await listJson(ctx.dataDir);
    ctx.headBefore = await git(`rev-parse HEAD`, ctx.worktree);

    // Run the REAL installed CLI exactly as `npx sparkle create-item` would.
    const cli = join(clone, 'node_modules/sparkle/bin/sparkle.js');
    ctx.tagline = 'RED test item ' + testId;
    try {
      const { stdout } = await execAsync(
        `node ${cli} create-item ${JSON.stringify(ctx.tagline)} --json`,
        { cwd: clone }
      );
      ctx.cliStdout = stdout.trim();
      ctx.cliExitCode = 0;
      try { ctx.itemId = JSON.parse(ctx.cliStdout).itemId; } catch { /* leave undefined */ }
    } catch (err) {
      ctx.cliExitCode = err.code ?? 1;
      ctx.cliStdout = (err.stdout || '').trim();
      ctx.cliError = err.message;
    }

    // Snapshot state AFTER.
    ctx.jsonAfter = await listJson(ctx.dataDir);
    ctx.newFiles = ctx.jsonAfter.filter(f => !ctx.jsonBefore.includes(f));
  }, 240000);

  afterAll(async () => {
    // Best-effort: stop any daemon the CLI launched, then remove the env.
    try {
      const { readPortFile } = await import('../../src/portFile.js');
      const info = ctx.dataDir ? await readPortFile(ctx.dataDir) : null;
      if (info) {
        const port = info.port;
        const http = (await import('http')).default;
        await new Promise((resolve) => {
          const req = http.request({ hostname: 'localhost', port, path: '/api/shutdown', method: 'POST' }, () => resolve());
          req.on('error', () => resolve());
          req.end();
        });
      }
    } catch { /* ignore */ }
    if (ctx.env) await cleanupEnvironment(ctx.env.testDir);
  }, 60000);

  test('CLI reports success (exit 0)', () => {
    expect(ctx.cliExitCode).toBe(0);
    expect(ctx.itemId).toMatch(/^\d{8}$/);
  });

  // This is the one that already passes today — it documents that the file DOES get
  // written to the correct directory. The bug is everything downstream.
  test('item JSON file is written to the data directory', () => {
    expect(ctx.newFiles.length).toBeGreaterThanOrEqual(1);
  });

  test('the new item file is committed (worktree has no untracked/uncommitted data files)', async () => {
    const porcelain = await git('status --porcelain', ctx.worktree);
    const dirtyDataFiles = porcelain
      .split('\n')
      .filter(Boolean)
      .filter(line => /sparkle-data\/.*\.json/.test(line));
    expect(dirtyDataFiles).toEqual([]);
  });

  test('the commit was created locally (HEAD advanced)', async () => {
    const headAfter = await git('rev-parse HEAD', ctx.worktree);
    expect(headAfter).not.toBe(ctx.headBefore);
  });

  // Push is debounced (~5s) + best-effort by design: the CLI blocks until COMMIT, then
  // the daemon flushes the push in the background. So we poll the bare origin for it.
  async function waitForOriginToMatchLocal(timeoutMs = 30000) {
    const localHead = await git('rev-parse HEAD', ctx.worktree);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const originSha = await git(`rev-parse ${ctx.branch}`, ctx.env.bareRepo).catch(() => '');
      if (originSha === localHead) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  }

  test('the commit was pushed to origin (deferred best-effort push)', async () => {
    expect(await waitForOriginToMatchLocal()).toBe(true);
    // The new item file must actually exist in the pushed origin tree.
    const originTree = await git(`ls-tree -r --name-only ${ctx.branch}`, ctx.env.bareRepo);
    for (const f of ctx.newFiles) {
      expect(originTree.split('\n')).toContain(`${ctx.directory}/${f}`);
    }
  }, 60000);

  test('a fresh clone (collaborator) can see the new item — wrong-results check', async () => {
    await waitForOriginToMatchLocal();
    const fresh = join(ctx.env.testDir, 'collaborator');
    await execAsync(`git clone ${ctx.env.bareRepo} ${fresh}`);
    await git(`checkout ${ctx.branch}`, fresh);
    const freshFiles = await listJson(join(fresh, 'sparkle-data'));
    for (const f of ctx.newFiles) {
      expect(freshFiles).toContain(f);
    }
  }, 60000);

  test('a daemon was launched/used by the CLI write', async () => {
    const { readPortFile } = await import('../../src/portFile.js');
    const info = await readPortFile(ctx.dataDir);

    // The port file records the owning PID alongside the port, so a crashed daemon can be
    // told from a running one. Assert both, then confirm the daemon actually answers.
    expect(info).not.toBeNull();
    expect(info.legacy).toBe(false);
    expect(Number.isInteger(info.pid)).toBe(true);
    expect(await ping(info.port)).toBe(true);
  }, 15000);
});
