/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Browser test (Playwright + local Chromium): named saved views.
 *
 * Covers the whole round trip, because the parts that can silently break are all at the
 * seams: capture the on-screen state, persist it server-side, surface it in the view
 * dropdown, restore it from a bookmarkable URL, and delete it again.
 *
 * Storage lives in <dataDir>/.aggregates/views.json, which is git-ignored — saved views
 * must never be committed.
 */

import { join } from 'path';
import { mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import playwright from 'playwright';
import {
  createTestEnvironment, installSparkle, initializeSparkle, getTarballPath,
  startDaemon, stopDaemon, startLogServer, stopLogServer, createTestId, cleanupEnvironment,
  apiCall
} from '../helpers/test-helpers.js';

const { chromium } = playwright;

describe('Saved views', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'browser-saved-views');
  const ctx = {};

  beforeAll(async () => {
    await mkdir(baseDir, { recursive: true });
    await startLogServer('browser-saved-views', baseDir);
    const env = await createTestEnvironment(baseDir, 'browser-saved-views', 1, createTestId());
    ctx.env = env;
    const clone = env.clones[0];
    ctx.clone = clone;
    await installSparkle(clone, await getTarballPath());
    await initializeSparkle(clone);
    ctx.port = await startDaemon(clone, `${createTestId()}-sv`);
    ctx.base = `http://localhost:${ctx.port}`;

    const pkg = JSON.parse(await readFile(join(clone, 'package.json'), 'utf8'));
    const { directory, worktree_path = '.sparkle-worktree' } = pkg.sparkle_config;
    ctx.dataDir = join(clone, worktree_path, directory);

    // A couple of items so the list has something to filter.
    await apiCall(ctx.port, '/api/createItem', { tagline: 'Alpha parser work', status: 'incomplete' });
    await apiCall(ctx.port, '/api/createItem', { tagline: 'Beta unrelated task', status: 'incomplete' });

    ctx.browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  }, 240000);

  afterAll(async () => {
    await stopLogServer(); // open HTTP handle; leaking it hangs isolated runs
    if (ctx.browser) await ctx.browser.close().catch(() => {});
    if (ctx.port) await stopDaemon(ctx.port).catch(() => {});
    if (ctx.env) await cleanupEnvironment(ctx.env.testDir);
  }, 60000);

  const openList = async (query = '') => {
    const page = await ctx.browser.newPage();
    await page.goto(`${ctx.base}/list_view.html${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#viewSelector', { timeout: 20000 });
    await page.waitForTimeout(800); // let init() finish (caches + saved view application)
    return page;
  };

  test('saves the current on-screen state under a name', async () => {
    const page = await openList();
    try {
      // Put recognisable state on screen: a search term and a non-default sort.
      await page.fill('#filterText', 'parser');
      await page.click('th.status-col');
      await page.waitForTimeout(300);

      // Save it through the same module the dropdown action uses.
      await page.evaluate(async () => {
        const { saveCurrentView } = await import('./savedViews.js');
        await saveCurrentView('Parser work');
      });

      const result = await apiCall(ctx.port, '/api/views');
      expect(result.views).toHaveLength(1);

      const view = result.views[0];
      expect(view.name).toBe('Parser work');
      expect(view.page).toBe('list_view.html');
      expect(view.state.search).toBe('parser');
      expect(view.state.sortColumn).toBe('status');
      expect(view.state.filters).toBeDefined();
    } finally {
      await page.close();
    }
  }, 60000);

  test('persists to the git-ignored .aggregates directory', async () => {
    const viewsPath = join(ctx.dataDir, '.aggregates', 'views.json');
    expect(existsSync(viewsPath)).toBe(true);

    const stored = JSON.parse(await readFile(viewsPath, 'utf8'));
    expect(stored.views.some(v => v.name === 'Parser work')).toBe(true);

    // The data directory's .gitignore must exclude .aggregates/, or saved views would be
    // committed — the one thing this feature must not do.
    const gitignore = await readFile(join(ctx.dataDir, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.aggregates\/$/m);
  }, 30000);

  test('appears in the view dropdown', async () => {
    const page = await openList();
    try {
      const labels = await page.$$eval('#viewSelector option', opts => opts.map(o => o.textContent.trim()));
      expect(labels).toContain('Parser work');
      expect(labels).toContain('Save current view as…');
      expect(labels).toContain('Manage saved views…');
    } finally {
      await page.close();
    }
  }, 60000);

  test('restores state from a bookmarkable URL', async () => {
    // This is the bookmark path: a bare URL with ?view=<name>, no prior session state.
    const page = await openList('?view=Parser%20work');
    try {
      const restored = await page.evaluate(() => ({
        search: document.getElementById('filterText').value
      }));
      expect(restored.search).toBe('parser');

      // The sort indicator proves the sort column was restored, not just the search box.
      const statusHeader = await page.$eval('th.status-col', el => el.textContent);
      expect(statusHeader).toMatch(/[▲▼]/);
    } finally {
      await page.close();
    }
  }, 60000);

  test('an unknown view name does not break the page', async () => {
    const page = await openList('?view=does-not-exist');
    try {
      // Still renders and still usable — a stale bookmark must degrade, not fail.
      await page.waitForSelector('#itemsContainer', { timeout: 10000 });
      const search = await page.$eval('#filterText', el => el.value);
      expect(search).toBe('');
    } finally {
      await page.close();
    }
  }, 60000);

  test('deletes a saved view', async () => {
    const page = await openList();
    try {
      await page.evaluate(async () => {
        const { deleteView } = await import('./savedViews.js');
        await deleteView('Parser work');
      });

      const result = await apiCall(ctx.port, '/api/views');
      expect(result.views).toHaveLength(0);
    } finally {
      await page.close();
    }
  }, 60000);
});
