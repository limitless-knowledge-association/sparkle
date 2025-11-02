#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle Daemon Launcher - Launches the Sparkle agent in detached background mode
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import http from 'http';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test if a daemon is running on a specific port
 */
async function testPort(port) {
  return new Promise((resolve) => {
    const testReq = http.get(`http://localhost:${port}/api/ping`, (res) => {
      resolve(true); // Daemon is running on this port
    });

    testReq.on('error', () => {
      resolve(false); // No daemon running
    });

    testReq.setTimeout(1000, () => {
      testReq.destroy();
      resolve(false);
    });
  });
}

/**
 * Check if a daemon is already running and return its port
 * Checks both project config (fixed port) and last_port.data (ephemeral port)
 */
async function checkExistingDaemon() {
  try {
    // Get git root
    const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    const packageJsonPath = join(gitRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    if (!packageJson.sparkle_config) {
      return null; // Not configured yet
    }

    const config = packageJson.sparkle_config;
    const worktreePath = config.worktree_path || '.sparkle-worktree';
    const dataPath = join(gitRoot, worktreePath, config.directory);

    // First priority: Check project config for fixed port
    const projectConfigPath = join(dataPath, '.aggregates', 'config.json');
    if (existsSync(projectConfigPath)) {
      try {
        const projectConfig = JSON.parse(await readFile(projectConfigPath, 'utf8'));
        if (projectConfig.port) {
          // Try fixed port from config
          const portToTry = projectConfig.port;
          const isRunning = await testPort(portToTry);
          if (isRunning) {
            return portToTry;
          }
        }
      } catch (error) {
        // Ignore config parsing errors, fall through to last_port.data
      }
    }

    // Second priority: Check last_port.data (ephemeral port)
    const portFilePath = join(dataPath, 'last_port.data');
    if (!existsSync(portFilePath)) {
      return null;
    }

    const portData = await readFile(portFilePath, 'utf8');
    const port = parseInt(portData.trim(), 10);

    // Try to connect to the port
    const isRunning = await testPort(port);
    return isRunning ? port : null;
  } catch (error) {
    return null;
  }
}

/**
 * Shutdown existing daemon (blocking, with timeout)
 */
async function shutdownExistingDaemon(port) {
  console.log(`Shutting down existing daemon on port ${port}...`);

  return new Promise((resolve, reject) => {
    const shutdownReq = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/shutdown',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('Shutdown request sent successfully');

          // Wait for daemon to actually stop (poll the port)
          const startTime = Date.now();
          const maxWait = 10000; // 10 seconds

          const checkStopped = () => {
            const testReq = http.get(`http://localhost:${port}/api/ping`, () => {
              // Still running
              if (Date.now() - startTime < maxWait) {
                setTimeout(checkStopped, 500); // Check again in 500ms
              } else {
                reject(new Error('Timeout waiting for daemon to stop'));
              }
            });

            testReq.on('error', () => {
              // Daemon stopped
              console.log('Daemon stopped successfully');
              resolve();
            });

            testReq.setTimeout(500, () => {
              testReq.destroy();
              // Timeout on this check means daemon is probably down
              resolve();
            });
          };

          // Start checking if daemon stopped
          setTimeout(checkStopped, 200); // Give it a moment to start shutting down
        } else {
          reject(new Error(`Shutdown failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    shutdownReq.on('error', (error) => {
      reject(new Error(`Failed to connect for shutdown: ${error.message}`));
    });

    shutdownReq.setTimeout(2000, () => {
      shutdownReq.destroy();
      reject(new Error('Timeout sending shutdown request'));
    });

    shutdownReq.end();
  });
}

// Check for existing daemon before launching
const existingDaemonPort = await checkExistingDaemon();

if (existingDaemonPort) {
  console.log(`Existing daemon found on port ${existingDaemonPort}`);

  try {
    // Attempt to shutdown the existing daemon (blocking, with 10s timeout)
    await shutdownExistingDaemon(existingDaemonPort);
  } catch (error) {
    console.error('ERROR: Failed to shutdown existing daemon:', error.message);
    console.error('Please manually stop the daemon with "npm run sparkle-halt" and try again.');
    process.exit(1);
  }
}

console.log('Starting Sparkle daemon in background...');

// Launch the agent in detached mode
const child = spawn(process.execPath, [join(__dirname, 'sparkle_agent.js')], {
  detached: true,
  stdio: 'ignore'
});

// Don't wait for the child process
child.unref();

console.log('Sparkle daemon started.');
console.log('Use "npm run sparkle-halt" to stop it.');
console.log('Use "npm run sparkle" to open the web interface.');
