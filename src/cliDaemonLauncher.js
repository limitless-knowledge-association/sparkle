/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * CLI Daemon Launcher
 * Utility for CLI commands to detect and launch the Sparkle daemon in API mode
 * Extracted and adapted from sparkle_client_launch.js
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getGitRoot } from './gitBranchOps.js';
import { spawnProcess } from './execUtils.js';
import { makeApiRequest } from './daemonClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Check if verbose logging is enabled (default: false for cleaner output)
const VERBOSE = process.env.SPARKLE_CLIENT_VERBOSE === 'true';

/**
 * Check if a daemon is already running by reading last_port.data and pinging it
 * @param {string} dataDir - Path to sparkle data directory
 * @returns {Promise<number|null>} Port number if daemon is running, null otherwise
 */
export async function getRunningDaemonPort(dataDir) {
  const portFile = join(dataDir, 'last_port.data');

  if (!existsSync(portFile)) {
    return null;
  }

  try {
    const portData = await readFile(portFile, 'utf8');
    const port = parseInt(portData.trim(), 10);

    // Verify daemon is actually responding
    try {
      await makeApiRequest(port, '/api/ping');
      return port;
    } catch (error) {
      // Port file exists but daemon not responding
      return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Launch a new daemon in API mode (5-min timeout)
 * Adapted from sparkle_client_launch.js
 * @param {string} gitRoot - Git repository root
 * @param {string} dataDir - Path to sparkle data directory
 * @returns {Promise<number>} Port number the daemon is running on
 */
export async function launchDaemon(gitRoot, dataDir) {
  const launchStart = Date.now();
  if (VERBOSE) console.error(`[CLI] Launching daemon from: ${gitRoot}`);

  // Use the agent from the installed Sparkle package in the target repo
  // not the agent from the current working directory
  const agentPath = join(gitRoot, 'node_modules/sparkle/bin/sparkle_agent.js');

  if (!existsSync(agentPath)) {
    throw new Error(`Daemon agent not found at: ${agentPath}`);
  }

  if (VERBOSE) console.error(`[CLI] Agent path: ${agentPath}`);
  if (VERBOSE) console.error(`[CLI] Spawning daemon process...`);

  // Start daemon in background with --keep-alive=api flag (5-min timeout)
  // spawnProcess from execUtils automatically hides windows on Windows
  const spawnStart = Date.now();
  const args = ['--keep-alive=api'];
  if (VERBOSE) console.error(`[CLI] Spawning daemon with args:`, args);

  const daemon = spawnProcess(process.execPath, [agentPath, ...args], {
    cwd: gitRoot,
    detached: true,
    stdio: 'ignore' // Daemon manages its own logging to daemon.log
  });
  if (VERBOSE) console.error(`[CLI] Daemon spawned in ${Date.now() - spawnStart}ms (PID: ${daemon.pid})`);

  // Detach the daemon so it continues after CLI exits
  daemon.unref();

  // Wait for daemon to start and write port file
  // Use 30s timeout for test environments where startup can be slower
  const port = await waitForDaemonStart(dataDir, 30000);

  const totalTime = Date.now() - launchStart;
  if (VERBOSE) console.error(`[CLI] Total daemon launch time: ${totalTime}ms`);
  return port;
}

/**
 * Wait for daemon to start by polling for port file
 * @param {string} dataDir - Path to sparkle data directory
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<number>} Port number
 */
async function waitForDaemonStart(dataDir, timeout = 10000) {
  const portFile = join(dataDir, 'last_port.data');
  const startTime = Date.now();
  let lastLogTime = startTime;
  let portFileFoundTime = null;
  let checkCount = 0;

  if (VERBOSE) console.error(`[CLI] Waiting for daemon to start (timeout: ${timeout}ms)...`);
  if (VERBOSE) console.error(`[CLI] Port file: ${portFile}`);

  while (Date.now() - startTime < timeout) {
    checkCount++;
    const elapsed = Date.now() - startTime;

    // Log every 5 seconds
    if (VERBOSE && Date.now() - lastLogTime > 5000) {
      console.error(`[CLI] Still waiting... ${elapsed}ms elapsed, checked ${checkCount} times`);
      lastLogTime = Date.now();
    }

    if (existsSync(portFile)) {
      if (!portFileFoundTime) {
        portFileFoundTime = Date.now();
        if (VERBOSE) console.error(`[CLI] Port file appeared after ${portFileFoundTime - startTime}ms`);
      }

      try {
        const portData = await readFile(portFile, 'utf8');
        const port = parseInt(portData.trim(), 10);

        // Verify daemon is responding
        try {
          await makeApiRequest(port, '/api/ping');
          const totalTime = Date.now() - startTime;
          if (VERBOSE) console.error(`[CLI] Daemon ready after ${totalTime}ms (${checkCount} checks)`);
          return port;
        } catch (error) {
          // Wait a bit more for daemon to be ready
          if (VERBOSE && Date.now() - portFileFoundTime > 5000) {
            console.error(`[CLI] Port file exists but daemon not responding after ${Date.now() - portFileFoundTime}ms`);
          }
        }
      } catch (error) {
        // File might be being written, try again
      }
    }

    // Sleep 100ms between checks
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const totalTime = Date.now() - startTime;
  console.error(`[CLI] TIMEOUT after ${totalTime}ms (${checkCount} checks)`);
  if (portFileFoundTime) {
    console.error(`[CLI] Port file appeared but daemon never responded to ping`);
  } else {
    console.error(`[CLI] Port file never appeared`);
  }
  throw new Error('Daemon failed to start within timeout');
}

/**
 * Ensure a daemon is running - detect existing or launch new one
 * This is the main function CLI commands should use
 * @param {string} dataDir - Path to sparkle data directory
 * @returns {Promise<number>} Port number of running daemon
 */
export async function ensureDaemon(dataDir) {
  // First check if daemon is already running
  const existingPort = await getRunningDaemonPort(dataDir);
  if (existingPort) {
    if (VERBOSE) console.error(`[CLI] Using existing daemon on port ${existingPort}`);
    return existingPort;
  }

  // Need to launch a new daemon
  if (VERBOSE) console.error(`[CLI] Starting daemon in API mode...`);

  // Derive git root from dataDir
  // dataDir is typically: /path/to/repo/.sparkle-worktree/sparkle-data
  // We need: /path/to/repo
  const { dirname } = await import('path');
  const worktreePath = dirname(dataDir); // Remove sparkle-data
  const gitRoot = dirname(worktreePath);  // Remove .sparkle-worktree

  const port = await launchDaemon(gitRoot, dataDir);
  if (VERBOSE) console.error(`[CLI] Daemon started on port ${port}`);
  return port;
}
