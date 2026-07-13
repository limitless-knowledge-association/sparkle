/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Browser test (Playwright + local Chromium): the shared header's four buttons
 * — New Window, Create Item, Configuration, Update Now — must work in all three
 * primary views (list_view, tree_view, monitor).
 *
 * Regression target: "Create Item" (and "Configuration") did nothing in tree_view /
 * monitor because only list_view defined window.openCreateItemModal /
 * window.openConfigurationModal. initializeHeader() now provides working defaults.
 */

import { join } from 'path';
import { mkdir } from 'fs/promises';
import playwright from 'playwright';
import {
  createTestEnvironment, installSparkle, initializeSparkle, getTarballPath,
  startDaemon, stopDaemon, startLogServer, createTestId, cleanupEnvironment
} from '../helpers/test-helpers.js';

const { chromium } = playwright;

describe('Browser header buttons work in all primary views', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'browser-buttons');
  const ctx = {};

  beforeAll(async () => {
    await mkdir(baseDir, { recursive: true });
    await startLogServer('browser-buttons', baseDir);
    const env = await createTestEnvironment(baseDir, 'browser-buttons', 1, createTestId());
    ctx.env = env;
    const clone = env.clones[0];
    await installSparkle(clone, await getTarballPath());
    await initializeSparkle(clone);
    ctx.port = await startDaemon(clone, `${createTestId()}-bb`);
    ctx.base = `http://localhost:${ctx.port}`;
    // Force the full Chromium build (the default headless-shell isn't installed).
    ctx.browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  }, 240000);

  afterAll(async () => {
    if (ctx.browser) await ctx.browser.close().catch(() => {});
    if (ctx.port) await stopDaemon(ctx.port).catch(() => {});
    if (ctx.env) await cleanupEnvironment(ctx.env.testDir);
  }, 60000);

  async function verifyView(view) {
    const page = await ctx.browser.newPage();
    try {
      await page.goto(`${ctx.base}/${view}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#createItemBtn', { timeout: 20000 });
      await page.waitForTimeout(500); // let per-view init (configSettings) settle

      const clearModals = () => page.evaluate(() =>
        document.querySelectorAll('.sparkle-modal').forEach(e => e.remove()));

      // 1) Create Item -> item-creator modal appears
      await page.click('#createItemBtn');
      await page.waitForSelector('[id^="itemCreatorModal-"]', { state: 'attached', timeout: 10000 });
      await clearModals();

      // 2) Configuration -> configuration modal appears
      await page.click('#configBtn');
      await page.waitForSelector('[id^="configurationModal-"]', { state: 'attached', timeout: 10000 });
      await clearModals();

      // 3) New Window -> opens a popup window
      const popupPromise = page.waitForEvent('popup', { timeout: 10000 });
      await page.click('#newWindowBtn');
      const popup = await popupPromise;
      await popup.close();

      // 4) Update Now -> triggers a fetch request to the daemon
      const reqPromise = page.waitForRequest(r => r.url().includes('/api/fetch'), { timeout: 10000 });
      await page.click('#updateNowBtn');
      await reqPromise;
    } finally {
      await page.close();
    }
  }

  test('list_view: all four buttons work', async () => {
    await verifyView('list_view.html');
  }, 90000);

  test('tree_view: all four buttons work', async () => {
    await verifyView('tree_view.html');
  }, 90000);

  test('monitor: all four buttons work', async () => {
    await verifyView('monitor.html');
  }, 90000);
});
