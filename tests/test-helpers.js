/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Integration Test Helpers
 * Utilities for creating isolated test environments with bare repos and clones
 */

import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { pathToFileURL } from 'url';
import http from 'http';
import { LogServer } from './log-server.js';

const execAsync = promisify(exec);

// Global log server for all tests
let logServer = null;

// Track running daemons for cleanup
const runningDaemons = [];

/**
 * Start log server if not already running
 * @param {string} testId - Test identifier
 * @param {string} baseDir - Base directory for test logs (optional, defaults to tmpdir)
 * @returns {Promise<number>} Log server port
 */
export async function startLogServer(testId, baseDir = null) {
  if (!logServer) {
    logServer = new LogServer();
    const logFile = baseDir
      ? join(baseDir, 'integration-tests.log')
      : join(tmpdir(), `sparkle-test-${testId}.log`);
    const port = await logServer.start(logFile);
    console.log(`📡 Log server started on port ${port}, writing to ${logFile}`);
    return port;
  }
  return logServer.getPort();
}

/**
 * Stop log server
 */
export async function stopLogServer() {
  if (logServer) {
    await logServer.stop();
    logServer = null;
  }
}

/**
 * Get log server port
 */
export function getLogServerPort() {
  return logServer ? logServer.getPort() : null;
}

/**
 * Create a unique test ID for process tracking
 */
export function createTestId() {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Unit test setup - creates a unique test directory within .integration_testing
 * Does NOT destroy the container directory - leaves artifacts for inspection
 * Container is cleaned by integration test runs
 *
 * @returns {Promise<string>} Path to unique test directory
 */
export async function unit_test_setup() {
  const { randomBytes } = await import('crypto');

  // Container directory (same as integration tests use)
  const containerDir = join(process.cwd(), '.integration_testing');

  // Create container if it doesn't exist (but never destroy it)
  await mkdir(containerDir, { recursive: true });

  // Loop until we successfully create a unique directory atomically
  while (true) {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    const testDir = join(containerDir, `unit-test-${timestamp}-${random}`);

    try {
      // Try to create directory - will fail if it already exists
      await mkdir(testDir, { recursive: false });
      // Success! Directory created atomically
      return testDir;
    } catch (error) {
      // Directory already exists (or other error), loop and try again with new random name
      // This ensures atomic creation without race conditions
      continue;
    }
  }
}

/**
 * Create a test environment with bare repo and N clones
 * @param {string} baseDir - Base directory for integration tests
 * @param {string} testName - Name of the test (will be sanitized for filesystem)
 * @param {number} numClones - Number of clones to create (default 1)
 * @param {string} testId - Unique test identifier
 * @returns {Promise<Object>} Environment object with paths and info
 */
export async function createTestEnvironment(baseDir, testName, numClones = 1, testId) {
  // Sanitize test name for filesystem (remove special chars, spaces to dashes)
  const sanitizedName = testName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const testDir = join(baseDir, sanitizedName);

  // Create test directory
  await mkdir(testDir, { recursive: true });

  console.log(`Creating test environment in ${testDir}`);

  // Create bare git repo
  const bareRepo = join(testDir, 'repo.git');
  await execAsync(`git init --bare ${bareRepo}`);

  // Create first clone and initialize
  const clone1 = join(testDir, 'clone1');
  await execAsync(`git clone ${bareRepo} ${clone1}`);

  // Configure git identity
  await execAsync('git config user.name "Test User 1"', { cwd: clone1 });
  await execAsync('git config user.email "test1@example.com"', { cwd: clone1 });

  // Add empty file
  await writeFile(join(clone1, 'x'), '', 'utf8');
  await execAsync('git add x', { cwd: clone1 });

  // Commit
  await execAsync('git commit -m "Initial commit"', { cwd: clone1 });

  // Push to create main branch
  await execAsync('git push -u origin main', { cwd: clone1 });

  // Pull to ensure synchronized
  await execAsync('git pull', { cwd: clone1 });

  // Create additional clones
  const clones = [clone1];
  for (let i = 2; i <= numClones; i++) {
    const clonePath = join(testDir, `clone${i}`);
    await execAsync(`git clone ${bareRepo} ${clonePath}`);

    await execAsync(`git config user.name "Test User ${i}"`, { cwd: clonePath });
    await execAsync(`git config user.email "test${i}@example.com"`, { cwd: clonePath });

    clones.push(clonePath);
  }

  return {
    testDir,
    bareRepo,
    clones,
    testId
  };
}

/**
 * Install Sparkle tarball in a directory with headless configuration
 * @param {string} dir - Directory to install in
 * @param {string} tarballPath - Path to sparkle tarball
 * @param {string} gitBranch - Branch name for sparkle (default: 'sparkle')
 * @param {string} directory - Data directory name (default: 'sparkle-data')
 */
export async function installSparkle(dir, tarballPath, gitBranch = 'sparkle', directory = 'sparkle-data') {
  console.log(`Installing Sparkle in ${dir}`);

  const { basename } = await import('path');
  const { copyFile } = await import('fs/promises');
  const tarballFilename = basename(tarballPath);

  // Step 1: Copy tarball to repo
  const destTarball = join(dir, tarballFilename);
  await copyFile(tarballPath, destTarball);
  console.log(`1. Copied tarball to repo`);

  // Step 2: Add and commit tarball
  await execAsync(`git add ${tarballFilename}`, { cwd: dir });
  await execAsync(`git commit -m "Add Sparkle tarball"`, { cwd: dir });
  console.log(`2. Committed tarball`);

  // Step 3: Initialize package.json
  await execAsync('npm init -y', { cwd: dir });
  console.log(`3. Initialized package.json`);

  // Step 4: Write .sparkle-autoconfig file
  const autoConfigPath = join(dir, '.sparkle-autoconfig');
  const autoConfig = {
    git_branch: gitBranch,
    directory: directory
  };
  await writeFile(autoConfigPath, JSON.stringify(autoConfig, null, 2), 'utf8');
  console.log(`4. Wrote .sparkle-autoconfig`);

  // Step 5: Install sparkle from local tarball
  await execAsync(`npm install --save-dev ./${tarballFilename}`, { cwd: dir });
  console.log(`5. Ran npm install`);

  // Step 6: Add and commit package.json and package-lock.json
  await execAsync('git add package.json package-lock.json', { cwd: dir });
  await execAsync(`git commit -m "Install and configure Sparkle"`, { cwd: dir });
  console.log(`6. Committed package files`);

  // Step 7: Push to origin (with retry logic for concurrent test setup)
  try {
    await execAsync('git push', { cwd: dir });
    console.log(`7. Pushed to origin`);
  } catch (error) {
    // If push fails, pull and retry (handles concurrent test setup)
    console.log(`7. Push conflict detected, pulling and retrying...`);
    try {
      await execAsync('git pull --no-rebase --no-edit', { cwd: dir });
    } catch (pullError) {
      // Pull may fail with merge conflicts on identical files (both added package.json)
      // Resolve by accepting theirs (files are identical anyway)
      console.log(`7. Merge conflict detected, resolving...`);
      await execAsync('git checkout --theirs package.json package-lock.json', { cwd: dir });
      await execAsync('git add package.json package-lock.json', { cwd: dir });
      await execAsync('git commit --no-edit', { cwd: dir });
    }
    await execAsync('git push', { cwd: dir });
    console.log(`7. Pushed to origin after pull`);
  }
}

/**
 * Initialize Sparkle worktree using production code
 * Uses the single entry point function from gitBranchOps.js
 * @param {string} dir - Directory containing sparkle installation
 */
export async function initializeSparkle(dir) {
  console.log(`Initializing Sparkle in ${dir}`);

  // Import the gitBranchOps module from installed sparkle package
  const gitBranchOpsPath = join(dir, 'node_modules/sparkle/src/gitBranchOps.js');
  const { initializeSparkleWorktree } = await import(pathToFileURL(gitBranchOpsPath).href);

  // Read package.json to get config
  const packageJsonPath = join(dir, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const config = packageJson.sparkle_config;

  if (!config) {
    throw new Error('No sparkle_config found in package.json');
  }

  const { git_branch, directory } = config;

  // Use the production git operations function directly (no daemon)
  await initializeSparkleWorktree(dir, git_branch, directory);

  console.log('Sparkle initialized successfully');
}

/**
 * Start Sparkle daemon in test mode
 * @param {string} dir - Directory containing sparkle installation
 * @param {string} testId - Test identifier for cleanup
 * @param {boolean} blockPush - If true, enable push blocking for race condition tests
 * @returns {Promise<number>} Port number the daemon is running on
 */
export async function startDaemon(dir, testId, blockPush = false) {
  console.log(`Starting daemon in ${dir} with test ID: ${testId}`);

  const agentPath = join(dir, 'node_modules/sparkle/bin/sparkle_agent.js');

  // Verify agent file exists
  const { existsSync } = await import('fs');
  if (!existsSync(agentPath)) {
    throw new Error(`Agent file not found at: ${agentPath}`);
  }
  console.log(`Agent path verified: ${agentPath}`);

  // Get log server port
  const logPort = getLogServerPort();

  // Environment with logging configuration
  const env = {
    ...process.env,
    SPARKLE_LOG_PORT: logPort ? logPort.toString() : '',
    SPARKLE_LOG_TOKEN: testId,
    SPARKLE_TEST_BLOCK_PUSH: blockPush ? 'true' : 'false'
  };

  // Start daemon using bash wrapper to avoid spawn issues
  // Use 'pipe' for stdio so we can monitor output
  const { fileURLToPath } = await import('url');
  const wrapperPath = join(fileURLToPath(import.meta.url), '..', 'start-daemon-wrapper.sh');

  const daemon = spawn(wrapperPath, [agentPath, testId, logPort.toString()], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Log daemon output
  daemon.stdout.on('data', (data) => {
    console.log(`[daemon ${testId}]`, data.toString().trim());
  });

  daemon.stderr.on('data', (data) => {
    console.error(`[daemon ${testId} ERROR]`, data.toString().trim());
  });

  // Store daemon reference for cleanup
  runningDaemons.push({ testId, pid: daemon.pid });

  // Monitor daemon for early exit
  daemon.on('exit', (code, signal) => {
    console.log(`⚠️  Daemon ${testId} exited: code=${code}, signal=${signal}`);
  });

  daemon.on('error', (err) => {
    console.error(`⚠️  Daemon ${testId} error:`, err);
  });

  console.log(`Daemon spawned with PID: ${daemon.pid}`);

  // Wait for daemon to start and get port
  const port = await waitForDaemon(dir, 10000);

  console.log(`Daemon started on port ${port}`);
  return port;
}

/**
 * Wait for daemon to start and return its port
 * @param {string} dir - Directory containing sparkle installation
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<number>} Port number
 */
async function waitForDaemon(dir, timeout = 10000) {
  const portFile = join(dir, '.sparkle-worktree/sparkle-data/last_port.data');
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const { readFile } = await import('fs/promises');
      const portData = await readFile(portFile, 'utf8');
      const port = parseInt(portData.trim(), 10);

      // Verify daemon is responding
      const responding = await checkDaemon(port);
      if (responding) {
        return port;
      }
    } catch (error) {
      // File doesn't exist yet or daemon not ready
    }

    await sleep(500);
  }

  throw new Error('Daemon failed to start within timeout');
}

/**
 * Check if daemon is responding
 * @param {number} port - Port to check
 * @returns {Promise<boolean>}
 */
export async function checkDaemon(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/ping`, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Stop daemon by port
 * @param {number} port - Port number
 */
export async function stopDaemon(port) {
  try {
    await apiCall(port, '/api/shutdown', {});

    // Wait for shutdown
    await sleep(2000);
  } catch (error) {
    // Daemon may already be stopped
  }
}

/**
 * Make an API call to the daemon
 * @param {number} port - Daemon port
 * @param {string} endpoint - API endpoint (e.g., '/api/createItem')
 * @param {Object} body - Request body (null for GET)
 * @returns {Promise<Object>} Response data
 */
export async function apiCall(port, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: endpoint,
      method: body ? 'POST' : 'GET',
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(body))
      } : {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(result.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(result);
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Wait for git fetch/push to sync
 * @param {number} port - Daemon port
 * @param {string} expectedSHA - Expected SHA after sync
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
export async function waitForSync(port, expectedSHA, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const status = await apiCall(port, '/api/status');
      if (status.lastChangeSHA === expectedSHA) {
        return;
      }
    } catch (error) {
      // Continue waiting
    }

    await sleep(1000);
  }

  throw new Error('Sync timeout');
}

/**
 * Clean up test environment
 * @param {string} testDir - Test directory to remove
 */
export async function cleanupEnvironment(testDir) {
  try {
    console.log(`Cleaning up ${testDir}`);
    await rm(testDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Warning: Failed to cleanup ${testDir}: ${error.message}`);
  }
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a push block for testing race conditions
 * Daemon will wait at push step until block is released
 * @param {string} testId - Test identifier
 * @returns {Object} Block control object with release() method
 */
export function createPushBlock(testId) {
  const blockFile = `/tmp/sparkle-push-block-${testId}`;

  writeFileSync(blockFile, 'block');
  console.log(`   🔒 Push block created: ${blockFile}`);

  return {
    file: blockFile,
    release: () => {
      if (existsSync(blockFile)) {
        unlinkSync(blockFile);
        console.log(`   🔓 Push block released: ${blockFile}`);
      }
    }
  };
}
