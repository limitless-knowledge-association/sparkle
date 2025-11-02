#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle Halt - Stops the running Sparkle daemon
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import http from 'http';

async function getGitRoot() {
  const { execSync } = await import('child_process');
  try {
    const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    return root;
  } catch (error) {
    throw new Error('Not a git repository');
  }
}

async function main() {
  try {
    const gitRoot = await getGitRoot();
    const packageJsonPath = join(gitRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    if (!packageJson.sparkle_config) {
      console.error('Sparkle is not configured in this repository.');
      process.exit(1);
    }

    const config = packageJson.sparkle_config;
    const worktreePath = config.worktree_path || '.sparkle-worktree';
    const portFilePath = join(gitRoot, worktreePath, config.directory, 'last_port.data');

    if (!existsSync(portFilePath)) {
      console.error('Sparkle daemon does not appear to be running (no port file found).');
      process.exit(1);
    }

    const portData = await readFile(portFilePath, 'utf8');
    const port = parseInt(portData.trim(), 10);

    console.log(`Sending shutdown request to daemon on port ${port}...`);

    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/shutdown',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('Sparkle daemon is shutting down.');
          process.exit(0);
        } else {
          console.error('Failed to shutdown daemon:', data);
          process.exit(1);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Failed to connect to daemon:', error.message);
      console.error('The daemon may have already stopped.');
      process.exit(1);
    });

    req.setTimeout(2000, () => {
      console.error('Timeout waiting for daemon response.');
      process.exit(1);
    });

    req.end();

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
