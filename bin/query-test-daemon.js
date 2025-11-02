#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Query Test Daemon - Debug integration tests by querying live daemon
 *
 * Usage:
 *   node bin/query-test-daemon.js <test-dir> <endpoint> <json-body>
 *
 * Example:
 *   node bin/query-test-daemon.js \
 *     .integration_testing/add-dependency-between-items/clone1 \
 *     /api/getItemDetails \
 *     '{"itemId": "66661786"}'
 */

import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import http from 'http';

const testDir = process.argv[2];
const endpoint = process.argv[3];
const bodyJson = process.argv[4];

if (!testDir || !endpoint) {
  console.error('Usage: node bin/query-test-daemon.js <test-dir> <endpoint> [json-body]');
  console.error('');
  console.error('Example:');
  console.error('  node bin/query-test-daemon.js \\');
  console.error('    .integration_testing/add-dependency-between-items/clone1 \\');
  console.error('    /api/getItemDetails \\');
  console.error('    \'{"itemId": "66661786"}\'');
  process.exit(1);
}

// Parse JSON body if provided
let body = null;
if (bodyJson) {
  try {
    body = JSON.parse(bodyJson);
  } catch (error) {
    console.error(`Error: Invalid JSON body: ${error.message}`);
    process.exit(1);
  }
}

// Validate test directory
if (!existsSync(testDir)) {
  console.error(`Error: Test directory not found: ${testDir}`);
  process.exit(1);
}

const agentPath = join(testDir, 'node_modules/sparkle/bin/sparkle_agent.js');
if (!existsSync(agentPath)) {
  console.error(`Error: Sparkle agent not found at: ${agentPath}`);
  process.exit(1);
}

const portFilePath = join(testDir, '.sparkle-worktree/sparkle-data/last_port.data');

console.log(`🚀 Starting daemon in: ${testDir}`);
console.log(`📡 Endpoint: ${endpoint}`);
if (body) {
  console.log(`📦 Body: ${JSON.stringify(body)}`);
}
console.log('');

// Start daemon (use absolute paths)
const absoluteTestDir = resolve(testDir);
const absoluteAgentPath = resolve(agentPath);

const daemon = spawn('node', [absoluteAgentPath, '--test-mode', '--keep-alive'], {
  cwd: absoluteTestDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false
});

let daemonOutput = '';
daemon.stdout.on('data', (data) => {
  daemonOutput += data.toString();
});

daemon.stderr.on('data', (data) => {
  daemonOutput += data.toString();
});

// Wait for daemon to start (check for port file)
async function waitForDaemon(timeout = 10000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (existsSync(portFilePath)) {
      try {
        const portData = await readFile(portFilePath, 'utf8');
        const port = parseInt(portData.trim(), 10);

        // Verify daemon is responding
        const responding = await checkDaemon(port);
        if (responding) {
          return port;
        }
      } catch (error) {
        // File exists but not readable yet
      }
    }

    // Check if daemon exited
    if (daemon.exitCode !== null) {
      console.error('❌ Daemon exited during startup');
      console.error('Output:', daemonOutput);
      process.exit(1);
    }

    await sleep(200);
  }

  console.error('❌ Timeout waiting for daemon to start');
  console.error('Output:', daemonOutput);
  daemon.kill();
  process.exit(1);
}

// Check if daemon is responding
function checkDaemon(port) {
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

// Make API call
function apiCall(port, endpoint, body) {
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
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Shutdown daemon
function shutdownDaemon(port) {
  return new Promise((resolve) => {
    apiCall(port, '/api/shutdown', {})
      .then(() => resolve())
      .catch(() => resolve()); // Ignore errors on shutdown
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main execution
(async () => {
  try {
    // Wait for daemon to start
    const port = await waitForDaemon();
    console.log(`✅ Daemon started on port ${port}`);
    console.log('');

    // Make API call
    console.log(`📞 Calling ${endpoint}...`);
    const result = await apiCall(port, endpoint, body);

    // Output result as pretty JSON
    console.log('');
    console.log('📄 Response:');
    console.log(JSON.stringify(result, null, 2));

    // Shutdown daemon
    console.log('');
    console.log('🛑 Shutting down daemon...');
    await shutdownDaemon(port);

    // Give daemon time to shutdown
    await sleep(500);

    if (daemon.exitCode === null) {
      daemon.kill();
    }

    console.log('✅ Done');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error(`❌ Error: ${error.message}`);

    // Try to kill daemon
    if (daemon.exitCode === null) {
      daemon.kill();
    }

    process.exit(1);
  }
})();
