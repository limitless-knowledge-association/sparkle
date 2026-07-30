/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Regression target: pressing "Update Now" only redrew the client when the fetch
 * pulled in new commits. The audit-trail and status-file views refresh on the
 * generic 'dataUpdated' SSE event, which the fetch path never sent — so those
 * views went stale until a full page reload.
 *
 * Contract now: an explicit /api/fetch always broadcasts 'dataUpdated', even
 * when there are no new commits, so the client's single refresh path always runs.
 */

import { join } from 'path';
import { mkdir } from 'fs/promises';
import http from 'http';
import {
  createTestEnvironment, installSparkle, initializeSparkle, getTarballPath,
  startDaemon, stopDaemon, startLogServer, stopLogServer, createTestId, cleanupEnvironment
} from '../helpers/test-helpers.js';

/**
 * Open the daemon SSE stream and resolve with the first event of `eventName`
 * seen within `timeoutMs`, or reject on timeout.
 */
function waitForSSEEvent(port, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: 'localhost', port, path: '/api/events', headers: { Accept: 'text/event-stream' } },
      (res) => {
        let buffer = '';
        const timer = setTimeout(() => {
          req.destroy();
          reject(new Error(`Timed out waiting for SSE '${eventName}' event`));
        }, timeoutMs);

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          // SSE frames are separated by a blank line; each frame has an
          // "event:" line and a "data:" line.
          let idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (frame.split('\n').some((line) => line === `event: ${eventName}`)) {
              clearTimeout(timer);
              req.destroy();
              resolve(true);
              return;
            }
          }
        });
      }
    );
    req.on('error', reject);
  });
}

function postFetch(port) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: 'localhost', port, path: '/api/fetch', method: 'POST' },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(JSON.parse(body || '{}')));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Explicit fetch always broadcasts dataUpdated', () => {
  const baseDir = join(process.cwd(), '.integration_testing', 'fetch-broadcast');
  const ctx = {};

  beforeAll(async () => {
    await mkdir(baseDir, { recursive: true });
    await startLogServer('fetch-broadcast', baseDir);
    const env = await createTestEnvironment(baseDir, 'fetch-broadcast', 1, createTestId());
    ctx.env = env;
    const clone = env.clones[0];
    await installSparkle(clone, await getTarballPath());
    await initializeSparkle(clone);
    ctx.port = await startDaemon(clone, `${createTestId()}-fb`);
  }, 240000);

  afterAll(async () => {
    await stopLogServer(); // open HTTP handle; leaking it hangs isolated runs
    if (ctx.port) await stopDaemon(ctx.port).catch(() => {});
    if (ctx.env) await cleanupEnvironment(ctx.env.testDir);
  }, 60000);

  test('POST /api/fetch with no new commits still emits dataUpdated', async () => {
    // Nothing has been pushed from elsewhere, so this fetch finds no changes.
    const eventSeen = waitForSSEEvent(ctx.port, 'dataUpdated', 15000);
    const result = await postFetch(ctx.port);
    expect(result.success).toBe(true);
    await expect(eventSeen).resolves.toBe(true);
  }, 30000);
});
