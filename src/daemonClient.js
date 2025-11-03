/**
 * Daemon Client Utilities
 *
 * Reusable functions for interacting with the Sparkle daemon,
 * used by both the CLI commands and integration tests.
 */

import http from 'http';
import { EventEmitter } from 'events';

/**
 * Make HTTP API request to daemon
 * @param {number} port - Daemon port
 * @param {string} path - API path
 * @param {string} method - HTTP method
 * @param {Object} body - Request body (optional)
 * @returns {Promise<Object>} Response data
 */
export function makeApiRequest(port, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Create SSE connection to daemon and listen for events
 * @param {number} port - Daemon port
 * @returns {EventEmitter} EventEmitter that emits daemon SSE events
 */
export function connectToSSE(port) {
  const emitter = new EventEmitter();

  const options = {
    hostname: 'localhost',
    port: port,
    path: '/api/events',
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  };

  const req = http.request(options, (res) => {
    if (res.statusCode !== 200) {
      emitter.emit('error', new Error(`SSE connection failed: ${res.statusCode}`));
      return;
    }

    emitter.emit('connected');

    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();

      // Process complete messages (ending with \n\n)
      const messages = buffer.split('\n\n');
      buffer = messages.pop(); // Keep incomplete message in buffer

      messages.forEach(message => {
        if (!message.trim()) return;

        // Parse SSE format: "event: eventName\ndata: {...}"
        const lines = message.split('\n');
        let eventName = 'message';
        let data = null;

        lines.forEach(line => {
          if (line.startsWith('event: ')) {
            eventName = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              data = JSON.parse(line.substring(6));
            } catch (e) {
              data = line.substring(6);
            }
          }
        });

        if (data !== null) {
          emitter.emit(eventName, data);
          emitter.emit('event', { eventName, data });
        }
      });
    });

    res.on('end', () => {
      emitter.emit('disconnected');
    });

    res.on('error', (error) => {
      emitter.emit('error', error);
    });
  });

  req.on('error', (error) => {
    emitter.emit('error', error);
  });

  req.end();

  // Store request so it can be aborted
  emitter.close = () => {
    req.destroy();
  };

  return emitter;
}

/**
 * Trigger fetch on daemon and wait for it to complete
 * Listens to SSE events to know when fetch finishes
 *
 * @param {number} port - Daemon port
 * @param {number} timeoutMs - Maximum time to wait (default 30s)
 * @returns {Promise<void>} Resolves when fetch completes
 */
export async function triggerFetchAndWait(port, timeoutMs = 30000) {
  return new Promise(async (resolve, reject) => {
    let sseConnection = null;
    let timeoutId = null;
    let fetchStarted = false;

    // Set up timeout
    timeoutId = setTimeout(() => {
      if (sseConnection) sseConnection.close();
      reject(new Error(`Fetch did not complete within ${timeoutMs}ms`));
    }, timeoutMs);

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (sseConnection) sseConnection.close();
    };

    try {
      // Connect to SSE before triggering fetch
      sseConnection = connectToSSE(port);

      // Wait for SSE connection to establish
      await new Promise((resolveConnect, rejectConnect) => {
        sseConnection.once('connected', resolveConnect);
        sseConnection.once('error', rejectConnect);
        setTimeout(() => rejectConnect(new Error('SSE connection timeout')), 5000);
      });

      // Listen for fetchStatus events
      sseConnection.on('fetchStatus', (data) => {
        if (data.inProgress === true) {
          fetchStarted = true;
        } else if (data.inProgress === false && fetchStarted) {
          // Fetch completed
          cleanup();
          resolve();
        }
      });

      // Listen for nextFetchTime events (means fetch already completed)
      sseConnection.on('nextFetchTime', (data) => {
        if (!fetchStarted) {
          // We connected after fetch was already done
          cleanup();
          resolve();
        }
      });

      sseConnection.on('error', (error) => {
        cleanup();
        reject(error);
      });

      // Trigger the fetch
      const response = await makeApiRequest(port, '/api/fetch', 'POST');

      if (response.deferred) {
        // Fetch was deferred due to pending commit
        // Wait for commit to complete, then fetch will happen automatically
        // The SSE listener will catch when it completes
        console.log('Fetch deferred (commit pending), waiting...');
      } else if (response.message && response.message.includes('already in progress')) {
        // Fetch already running, our SSE listener will catch completion
        fetchStarted = true;
      } else if (response.success) {
        // Fetch started, our SSE listener will catch completion
        fetchStarted = true;
      }

    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
