/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * CLI Daemon Launcher
 * Utility for CLI commands to detect and launch the Sparkle daemon in API mode
 * Extracted and adapted from sparkle_client_launch.js
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getGitRoot } from './gitBranchOps.js';
import { spawnProcess } from './execUtils.js';
import { makeApiRequest } from './daemonClient.js';
import {
  readPortFile,
  readLivePortFile,
  retireLegacyPortFile,
  deletePortFile,
  isProcessAlive
} from './portFile.js';
import { getDaemonLaunchTimeoutMs } from './configManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Check if verbose logging is enabled (default: false for cleaner output)
const VERBOSE = process.env.SPARKLE_CLIENT_VERBOSE === 'true';

/**
 * Check if a daemon is already running by reading last_port.data and pinging it
 * @param {string} dataDir - Path to sparkle data directory
 * @returns {Promise<number|null>} Port number if daemon is running, null otherwise
 */
export async function getRunningDaemonPort(dataDir) {
  // readLivePortFile removes the file outright if the recorded PID is gone, so a crashed
  // daemon stops advertising a port nobody is listening on.
  const info = await readLivePortFile(dataDir);

  if (!info) {
    return null;
  }

  // A legacy bare-integer file was written by an older Sparkle. Retire it (shut that
  // daemon down, delete the file) and report "no daemon" so the caller launches a
  // current one, which writes the file in the new format.
  if (info.legacy) {
    await retireLegacyPortFile(dataDir, info.port);
    return null;
  }

  // The PID being alive is not proof the daemon is usable — PIDs get recycled — so the
  // ping stays the authority for "may I use this port".
  try {
    await makeApiRequest(info.port, '/api/ping');
    return info.port;
  } catch (error) {
    // Recorded owner is alive but not serving (still starting, or wedged). Leave the file
    // alone: the PID check owns deletion, and the process still exists.
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

  // How long to wait is configurable: SPARKLE_DAEMON_LAUNCH_TIMEOUT_MS beats the project
  // config's daemonLaunchTimeoutMs, which beats the 30s default. Slow machines, cold npm
  // caches and CI runners all legitimately need more than a fixed ceiling.
  const timeout = await getDaemonLaunchTimeoutMs(dataDir);
  const port = await waitForDaemonStart(dataDir, timeout, daemon.pid);

  const totalTime = Date.now() - launchStart;
  if (VERBOSE) console.error(`[CLI] Total daemon launch time: ${totalTime}ms`);
  return port;
}

/**
 * Wait for daemon to start by polling for port file
 * @param {string} dataDir - Path to sparkle data directory
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} [spawnedPid] - PID we spawned, so we can fail fast if it dies
 * @returns {Promise<number>} Port number
 */
async function waitForDaemonStart(dataDir, timeout, spawnedPid = null) {
  const startTime = Date.now();
  let lastLogTime = startTime;
  let portFileFoundTime = null;
  let checkCount = 0;

  if (VERBOSE) console.error(`[CLI] Waiting for daemon to start (timeout: ${timeout}ms)...`);

  while (Date.now() - startTime < timeout) {
    checkCount++;
    const elapsed = Date.now() - startTime;

    // Log every 5 seconds
    if (VERBOSE && Date.now() - lastLogTime > 5000) {
      console.error(`[CLI] Still waiting... ${elapsed}ms elapsed, checked ${checkCount} times`);
      lastLogTime = Date.now();
    }

    const info = await readPortFile(dataDir);

    if (info) {
      if (!portFileFoundTime) {
        portFileFoundTime = Date.now();
        if (VERBOSE) console.error(`[CLI] Port file appeared after ${portFileFoundTime - startTime}ms`);
      }

      // Verify daemon is responding
      try {
        await makeApiRequest(info.port, '/api/ping');
        const totalTime = Date.now() - startTime;
        if (VERBOSE) console.error(`[CLI] Daemon ready after ${totalTime}ms (${checkCount} checks)`);
        return info.port;
      } catch (error) {
        // Wait a bit more for daemon to be ready
        if (VERBOSE && Date.now() - portFileFoundTime > 5000) {
          console.error(`[CLI] Port file exists but daemon not responding after ${Date.now() - portFileFoundTime}ms`);
        }
      }
    }

    // If the process we spawned has already exited, no amount of further waiting helps.
    // Fail immediately rather than burning the whole timeout on a daemon that is gone.
    if (spawnedPid && !isProcessAlive(spawnedPid)) {
      await deletePortFile(dataDir);
      throw new Error(
        `Daemon process ${spawnedPid} exited during startup. ` +
        `Check daemon.log in the sparkle data directory.`);
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
  throw new Error(
    `Daemon failed to start within ${timeout}ms. ` +
    `Raise it with SPARKLE_DAEMON_LAUNCH_TIMEOUT_MS or ` +
    `\`sparkle config set daemonLaunchTimeoutMs <ms>\`.`);
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
