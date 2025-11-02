#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle Client Launcher - Opens the Sparkle web interface in the browser
 * Automatically starts the daemon if it's not running
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { openBrowser } from '../src/browserLauncher.js';
import { getGitRoot } from '../src/gitBranchOps.js';
import { spawnProcess } from '../src/execUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Check if daemon is responding on a given port
 */
async function checkDaemon(port) {
  return new Promise((resolve) => {
    const testReq = http.get(`http://localhost:${port}/api/ping`, (res) => {
      resolve(true);
    });

    testReq.on('error', () => {
      resolve(false);
    });

    testReq.setTimeout(1000, () => {
      testReq.destroy();
      resolve(false);
    });
  });
}

/**
 * Get the daemon port if it's running
 */
async function getDaemonPort(gitRoot, config) {
  const worktreePath = config.worktree_path || '.sparkle-worktree';
  const portFilePath = join(gitRoot, worktreePath, config.directory, 'last_port.data');

  if (!existsSync(portFilePath)) {
    return null;
  }

  try {
    const portData = await readFile(portFilePath, 'utf8');
    const port = parseInt(portData.trim(), 10);

    if (isNaN(port) || port <= 0) {
      return null;
    }

    // Verify daemon is actually responding
    const isRunning = await checkDaemon(port);
    return isRunning ? port : null;
  } catch (error) {
    return null;
  }
}

/**
 * Launch the daemon in the background
 */
function launchDaemon() {
  console.log('Launching Sparkle daemon...');
  console.log('Browser will open when daemon is ready.');

  // Launch the agent in detached mode
  // spawnProcess from execUtils automatically hides windows on Windows
  const child = spawnProcess(process.execPath, [join(__dirname, 'sparkle_agent.js')], {
    detached: true,
    stdio: 'ignore'
  });

  child.unref();
}

/**
 * Main function
 */
async function main() {
  try {
    const gitRoot = await getGitRoot();
    const packageJsonPath = join(gitRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    if (!packageJson.sparkle_config) {
      console.error('Sparkle is not configured in this repository.');
      console.error('Install and configure Sparkle first.');
      process.exit(1);
    }

    const config = packageJson.sparkle_config;

    // Check if daemon is already running
    const port = await getDaemonPort(gitRoot, config);

    if (port) {
      // Daemon is running, open browser
      const url = `http://localhost:${port}`;
      console.log(`Opening Sparkle at ${url}`);
      await openBrowser(url);
    } else {
      // Daemon not running, launch it (daemon will open browser when ready)
      launchDaemon();
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
