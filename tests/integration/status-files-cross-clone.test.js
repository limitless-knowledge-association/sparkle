/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status files across two real clones, each running its own daemon.
 *
 * status-file-conflict.test.js pins the git layer down directly. This one exercises the
 * production wiring: two independent installs, publishing through the real CLI, syncing
 * through a shared origin via the daemons' own fetch.
 *
 * The property under test is the one the feature exists for: a status file is never
 * merged. What a clone ends up with is byte-for-byte something a publisher submitted,
 * never a blend of two reports.
 */

import { join } from 'path';
import { writeFile } from 'fs/promises';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import {
  createTestEnvironment, installSparkle, initializeSparkle, getTarballPath,
  createTestId, cleanupEnvironment, stopAllDaemonsUnder, startDaemon, startLogServer,
  stopLogServer
} from '../helpers/test-helpers.js';
import { triggerFetchAndWait } from '../../src/daemonClient.js';

const execAsync = promisify(execCallback);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** Long enough for the daemon's commit + 5s push debounce to land. */
const PUSH_SETTLE_MS = 9000;

describe('Status files across clones (through real daemons)', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'status-files-cross-clone');
  const ctx = {};

  const cliIn = async (clone, args) => {
    const cliPath = join(clone, 'node_modules/sparkle/bin/sparkle.js');
    const { stdout } = await execAsync(`node ${cliPath} ${args} --json`, { cwd: clone });
    const out = stdout.trim();
    try { return JSON.parse(out); } catch { return out; }
  };

  const fetchIn = async (clone, name) => {
    const cliPath = join(clone, 'node_modules/sparkle/bin/sparkle.js');
    const { stdout } = await execAsync(`node ${cliPath} fetch-status-file ${name}`, { cwd: clone });
    return stdout;
  };

  /** Publish via stdin from a given clone, exactly as a CI system would. */
  const publishIn = async (clone, name, content) => {
    const cliPath = join(clone, 'node_modules/sparkle/bin/sparkle.js');
    await writeFile(join(clone, 'payload.tmp'), content, 'utf8');
    await execAsync(`node ${cliPath} add-status-file ${name} --json < payload.tmp`, {
      cwd: clone,
      shell: '/bin/bash'
    });
  };

  beforeAll(async () => {
    const { mkdir } = await import('fs/promises');
    await mkdir(baseDir, { recursive: true });
    await startLogServer('status-files-cross-clone', baseDir);

    const testId = createTestId();
    const env = await createTestEnvironment(baseDir, 'cross-clone', 2, testId);
    ctx.env = env;
    [ctx.cloneA, ctx.cloneB] = env.clones;

    // Clone A: full install + sparkle branch creation.
    await installSparkle(ctx.cloneA, await getTarballPath());
    await initializeSparkle(ctx.cloneA);
    ctx.portA = await startDaemon(ctx.cloneA, `${testId}-cloneA`);
    await sleep(2000);

    // Clone B: pull A's install, then let ITS daemon discover the existing sparkle
    // branch and build its own worktree. Re-initializing would try to recreate the
    // branch A already pushed.
    await execAsync('git pull --no-rebase --no-edit', { cwd: ctx.cloneB });
    await execAsync('npm install', { cwd: ctx.cloneB });
    ctx.portB = await startDaemon(ctx.cloneB, `${testId}-cloneB`);
    await sleep(2000);
  }, 300000);

  afterAll(async () => {
    await stopAllDaemonsUnder(baseDir);
    // The log server is an open HTTP handle; without this jest never exits.
    await stopLogServer();
    if (ctx.env) await cleanupEnvironment(ctx.env.testDir);
  }, 60000);

  test('a status file published in clone A becomes visible in clone B', async () => {
    await publishIn(ctx.cloneA, 'shared-report.json', '{"from":"A"}\n');
    await sleep(PUSH_SETTLE_MS);

    await triggerFetchAndWait(ctx.portB);

    const list = await cliIn(ctx.cloneB, 'list-status-files');
    expect(list.files.map(f => f.name)).toContain('shared-report.json');
    expect(await fetchIn(ctx.cloneB, 'shared-report.json')).toBe('{"from":"A"}\n');
  }, 120000);

  test('concurrent publishes never produce a blended report', async () => {
    // A says the build broke; B says the deploy broke. Different lines of one file:
    // a textual merge would happily invent a report showing BOTH.
    const fromA = '{\n  "build": "RED-from-A",\n  "deploy": "green"\n}\n';
    const fromB = '{\n  "build": "green",\n  "deploy": "RED-from-B"\n}\n';

    await publishIn(ctx.cloneA, 'ci.json', fromA);
    await sleep(PUSH_SETTLE_MS);

    // B publishes its own version without having seen A's.
    await publishIn(ctx.cloneB, 'ci.json', fromB);

    // Let B's own debounced push run: it fetches, hits the conflict, and resolves it.
    // (Do NOT trigger an explicit fetch here — with a push pending the daemon defers it
    // by design, and we would just wait on a fetch that never runs.)
    await sleep(PUSH_SETTLE_MS * 2);

    const content = await fetchIn(ctx.cloneB, 'ci.json');

    // Exactly one of the published reports — never a mixture, never markers.
    expect([fromA, fromB]).toContain(content);
    expect(content.includes('RED-from-A') && content.includes('RED-from-B')).toBe(false);
    expect(content).not.toMatch(/<<<<<<<|>>>>>>>/);
  }, 180000);

  test('clone B still commits ordinary items after the status conflict', async () => {
    // The wedge regression, end to end: an unresolved conflict would freeze item writes.
    const created = await cliIn(ctx.cloneB, 'create-item "still working"');
    expect(created.itemId).toMatch(/^\d{8}$/);

    const list = await cliIn(ctx.cloneB, 'list');
    expect(list.items.map(i => i.itemId)).toContain(created.itemId);
  }, 120000);
});
