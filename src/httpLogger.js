/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * HTTP Logger - Send logs to HTTP endpoint for centralized collection
 */

import http from 'http';

let logServerPort = null;
let logToken = null;

/**
 * Initialize HTTP logger with server port and token
 * @param {number} port - Log server port
 * @param {string} token - Log token for identifying this process
 */
export function initHttpLogger(port, token) {
  logServerPort = port;
  logToken = token;
}

/**
 * Log message to HTTP server (fire and forget)
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Log message
 * @param {object} data - Optional additional data
 */
export function httpLog(level, message, data = null) {
  // Always log to console as fallback
  const consoleMsg = `[${logToken || 'unknown'}] ${message}`;
  if (level === 'error') {
    console.error(consoleMsg, data || '');
  } else {
    console.log(consoleMsg, data || '');
  }

  // If no log server configured, just use console
  if (!logServerPort || !logToken) {
    return;
  }

  // Send to log server (fire and forget, don't await)
  const payload = JSON.stringify({
    token: logToken,
    level,
    message,
    data,
    timestamp: new Date().toISOString()
  });

  const req = http.request({
    hostname: 'localhost',
    port: logServerPort,
    path: '/log',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  });

  req.on('error', () => {
    // Silently ignore errors - fallback to console only
  });

  req.write(payload);
  req.end();
}

/**
 * Create convenience logging functions
 */
export function createLogger(token) {
  return {
    info: (msg, data) => httpLog('info', msg, data),
    warn: (msg, data) => httpLog('warn', msg, data),
    error: (msg, data) => httpLog('error', msg, data),
    debug: (msg, data) => httpLog('debug', msg, data)
  };
}
