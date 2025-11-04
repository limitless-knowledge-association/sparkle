/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Test Log Server - Collects logs from test processes via HTTP
 */

import { createServer } from 'http';
import { writeFile, appendFile } from 'fs/promises';

export class LogServer {
  constructor() {
    this.server = null;
    this.port = null;
    this.logs = [];
    this.logFile = null;
  }

  /**
   * Start log server on ephemeral port
   * @param {string} logFilePath - Path to write collected logs
   * @returns {Promise<number>} Port number
   */
  async start(logFilePath) {
    this.logFile = logFilePath;

    // Write log file header
    await writeFile(logFilePath, `Test Log Started: ${new Date().toISOString()}\n\n`);

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.listen(0, 'localhost', () => {
        this.port = this.server.address().port;
        console.log(`📡 Log server listening on port ${this.port}`);
        resolve(this.port);
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Handle incoming log requests
   */
  async handleRequest(req, res) {
    if (req.method === 'POST' && req.url === '/log') {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);

          // Handle array of log entries (for batched frontend logs)
          if (Array.isArray(parsed.logs)) {
            // Each log entry is already formatted as a string
            for (const logLine of parsed.logs) {
              // Log entries from frontend are pre-formatted strings
              const fullLine = logLine + '\n';

              // Write to console
              process.stdout.write(fullLine);

              // Append to log file
              if (this.logFile) {
                await appendFile(this.logFile, fullLine);
              }
            }

            res.writeHead(200);
            res.end('OK');
            return;
          }

          // Handle single log entry (for daemon HTTP logger)
          const logEntry = parsed;
          this.logs.push(logEntry);

          // Format log line
          const logLine = `[${logEntry.timestamp}] [${logEntry.token}] [${logEntry.level.toUpperCase()}] ${logEntry.message}${logEntry.data ? ' ' + JSON.stringify(logEntry.data) : ''}\n`;

          // Write to console
          if (logEntry.level === 'error') {
            process.stderr.write(logLine);
          } else {
            process.stdout.write(logLine);
          }

          // Append to log file
          if (this.logFile) {
            await appendFile(this.logFile, logLine);
          }

          res.writeHead(200);
          res.end('OK');
        } catch (error) {
          res.writeHead(400);
          res.end('Bad Request');
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }

  /**
   * Stop log server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log(`📡 Log server stopped`);
          resolve();
        });
      });
    }
  }

  /**
   * Get all collected logs
   */
  getLogs() {
    return this.logs;
  }

  /**
   * Get port number
   */
  getPort() {
    return this.port;
  }
}
