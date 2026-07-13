/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Exercises the CLI feature-parity commands end-to-end through the real installed
 * binary (and thus the daemon): dependencies, tagline edit, custom statuses, and the
 * read commands (list, roots, pending, takers, audit, candidates, statuses).
 */

import { join } from 'path';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import {
  createTestEnvironment, installSparkle, initializeSparkle, getTarballPath,
  createTestId, cleanupEnvironment, stopAllDaemonsUnder
} from '../helpers/test-helpers.js';

const execAsync = promisify(execCallback);

describe('CLI feature parity with the browser (through the daemon)', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'cli-features');
  const ctx = {};

  // Run the installed CLI with --json and return the parsed object.
  const cli = async (args) => {
    const { stdout } = await execAsync(`node ${ctx.cliPath} ${args} --json`, { cwd: ctx.clone });
    const out = stdout.trim();
    try { return JSON.parse(out); } catch { return out; }
  };

  beforeAll(async () => {
    const env = await createTestEnvironment(baseDir, 'cli-features', 1, createTestId());
    ctx.env = env;
    ctx.clone = env.clones[0];
    await installSparkle(ctx.clone, await getTarballPath());
    await initializeSparkle(ctx.clone);
    ctx.cliPath = join(ctx.clone, 'node_modules/sparkle/bin/sparkle.js');

    ctx.i1 = (await cli(`create-item "Parent task"`)).itemId;
    ctx.i2 = (await cli(`create-item "Child task"`)).itemId;
  }, 240000);

  afterAll(async () => {
    await stopAllDaemonsUnder(baseDir);
    if (ctx.env) await cleanupEnvironment(ctx.env.testDir);
  }, 60000);

  test('create-item produced two 8-digit ids', () => {
    expect(ctx.i1).toMatch(/^\d{8}$/);
    expect(ctx.i2).toMatch(/^\d{8}$/);
  });

  test('list shows both items', async () => {
    const res = await cli('list');
    const ids = res.items.map(i => i.itemId);
    expect(ids).toContain(ctx.i1);
    expect(ids).toContain(ctx.i2);
  });

  test('add-dependency makes i1 depend on i2 (visible via candidates.current)', async () => {
    const add = await cli(`add-dependency ${ctx.i1} ${ctx.i2}`);
    expect(add.success).toBe(true);

    const cand = await cli(`candidates ${ctx.i1}`);
    const currentIds = cand.current.map(c => c.itemId);
    const candidateIds = cand.candidates.map(c => c.itemId);
    expect(currentIds).toContain(ctx.i2);       // now a current dependency
    expect(candidateIds).not.toContain(ctx.i2); // no longer an addable candidate
  });

  test('roots lists i1 but not i2 (i2 has a dependent)', async () => {
    const res = await cli('roots');
    const rootIds = res.roots.map(r => r.itemId);
    expect(rootIds).toContain(ctx.i1);
    expect(rootIds).not.toContain(ctx.i2);
  });

  test('alter tagline updates the item', async () => {
    const r = await cli(`alter ${ctx.i1} tagline "Renamed parent"`);
    expect(r.success).toBe(true);
    const list = await cli('list');
    const item = list.items.find(i => i.itemId === ctx.i1);
    expect(item.tagline).toBe('Renamed parent');
  });

  test('set-statuses configures custom statuses and they become alterable', async () => {
    const set = await cli('set-statuses in-progress blocked');
    expect(set.statuses).toEqual(expect.arrayContaining(['in-progress', 'blocked', 'completed', 'incomplete']));

    const statuses = await cli('statuses');
    expect(statuses.statuses).toEqual(expect.arrayContaining(['in-progress', 'blocked']));

    const altered = await cli(`alter ${ctx.i1} status in-progress`);
    expect(altered.success).toBe(true);
  });

  test('audit returns a non-empty event trail for i1', async () => {
    const res = await cli(`audit ${ctx.i1}`);
    expect(Array.isArray(res.events)).toBe(true);
    expect(res.events.length).toBeGreaterThan(0);
  });

  test('pending and takers return arrays', async () => {
    const pending = await cli('pending');
    expect(Array.isArray(pending.items)).toBe(true);
    const takers = await cli('takers');
    expect(Array.isArray(takers.takers)).toBe(true);
  });

  test('config get returns a merged config object', async () => {
    const res = await cli('config get');
    expect(res).toHaveProperty('merged');
    expect(res).toHaveProperty('project');
  });

  test('remove-dependency detaches i2 from i1', async () => {
    const rm = await cli(`remove-dependency ${ctx.i1} ${ctx.i2}`);
    expect(rm.success).toBe(true);
    const cand = await cli(`candidates ${ctx.i1}`);
    expect(cand.current.map(c => c.itemId)).not.toContain(ctx.i2);
    expect(cand.candidates.map(c => c.itemId)).toContain(ctx.i2); // addable again
  });
});
