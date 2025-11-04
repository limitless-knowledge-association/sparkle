#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile, writeFile, appendFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Will be set after we determine git root
let logFilePath = null;

// Helper for logging (both console and file)
function log(...args) {
  const message = `[postinstall ${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(message);
  // Async write to file if path is set, don't await
  if (logFilePath) {
    appendFile(logFilePath, message + '\n').catch(() => {});
  }
}

/**
 * Get git root directory
 */
async function getGitRoot() {
  const { execSync } = await import('child_process');
  try {
    const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    return root;
  } catch (error) {
    // Not in a git repository - use current directory
    return process.cwd();
  }
}

/**
 * Check if package.json has sparkle_config
 */
async function hasSparkleConfig() {
  try {
    const gitRoot = await getGitRoot();
    const packageJsonPath = join(gitRoot, 'package.json');

    if (!existsSync(packageJsonPath)) {
      return false;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    return !!packageJson.sparkle_config;
  } catch (error) {
    return false;
  }
}

/**
 * Get the new version of Sparkle being installed
 */
async function getNewVersion() {
  try {
    const packageJsonPath = join(__dirname, '../package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    log('Warning: Could not read new version:', error.message);
    return null;
  }
}

/**
 * Send shutdown request to any running daemon
 * Simple approach - just send shutdown if port file exists
 */
async function checkAndShutdownOldDaemon() {
  try {
    log('Checking for running daemon...');
    const gitRoot = await getGitRoot();
    log(`Git root: ${gitRoot}`);
    const packageJsonPath = join(gitRoot, 'package.json');

    if (!existsSync(packageJsonPath)) {
      log('No package.json found');
      return;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    if (!packageJson.sparkle_config) {
      log('No sparkle_config in package.json');
      return; // Not configured yet
    }

    const config = packageJson.sparkle_config;
    const worktreePath = config.worktree_path || '.sparkle-worktree';
    const portFilePath = join(gitRoot, worktreePath, config.directory, 'last_port.data');
    log(`Looking for port file: ${portFilePath}`);

    if (!existsSync(portFilePath)) {
      log('No port file found - daemon not running');
      return; // No daemon running
    }

    const portData = await readFile(portFilePath, 'utf8');
    const port = parseInt(portData.trim(), 10);
    log(`Found daemon on port: ${port}`);

    // Always send shutdown on install (simpler, more reliable)
    log('Sending shutdown request to daemon...');

    // Send shutdown request and wait for it to complete
    await new Promise((resolve) => {
      const shutdownReq = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/shutdown',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        // Request sent successfully
        log('Shutdown request sent successfully');
        resolve();
      });

      shutdownReq.on('error', (error) => {
        log(`Error sending shutdown (daemon may already be down): ${error.message}`);
        resolve();
      });

      shutdownReq.setTimeout(1000, () => {
        log('Timeout sending shutdown request (daemon may already be down)');
        shutdownReq.destroy();
        resolve();
      });

      shutdownReq.end();
    });

  } catch (error) {
    log(`Exception in checkAndShutdownOldDaemon: ${error.message}`);
    // Silently ignore all errors - daemon might not be running
    // This is expected during normal operation
  }
}

/**
 * Auto-configure Sparkle from .sparkle-autoconfig file
 * Returns true if auto-configured, false if UI needed
 */
async function autoConfigureFromFile() {
  try {
    const gitRoot = await getGitRoot();
    log(`Git root: ${gitRoot}`);

    const autoConfigPath = join(gitRoot, '.sparkle-autoconfig');
    log(`Checking for auto-config at: ${autoConfigPath}`);
    log(`File exists: ${existsSync(autoConfigPath)}`);

    // Check if auto-config file exists
    if (!existsSync(autoConfigPath)) {
      log('Auto-config file not found');
      return false;
    }

    log(`Found .sparkle-autoconfig file`);

    // Read auto-config file
    const configData = await readFile(autoConfigPath, 'utf8');
    const config = JSON.parse(configData);

    const { git_branch, directory, worktree_path } = config;

    if (!git_branch || !directory) {
      log('Invalid auto-config file: missing git_branch or directory');
      return false;
    }

    // Use default worktree_path if not specified in auto-config
    const finalWorktreePath = worktree_path || '.sparkle-worktree';

    log(`Auto-configuring from file: branch=${git_branch}, directory=${directory}, worktree=${finalWorktreePath}`);

    const packageJsonPath = join(gitRoot, 'package.json');

    // Read package.json
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    // Add sparkle_config
    packageJson.sparkle_config = {
      git_branch: git_branch,
      directory: directory,
      worktree_path: finalWorktreePath
    };

    // Write back to package.json
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

    // Delete the auto-config file
    await unlink(autoConfigPath);

    log('Auto-configuration complete');
    console.log(`Sparkle configured: branch=${git_branch}, directory=${directory}`);
    console.log('Note: Sparkle worktree will be initialized on first daemon start');
    return true;
  } catch (error) {
    log(`Auto-configuration failed: ${error.message}`);
    return false;
  }
}

/**
 * Ensure sparkle_config has worktree_path set to default if missing
 * This upgrades old configs to include the new worktree_path field
 */
async function ensureWorktreePath() {
  try {
    const gitRoot = await getGitRoot();
    const packageJsonPath = join(gitRoot, 'package.json');

    if (!existsSync(packageJsonPath)) {
      log('No package.json found for worktree_path check');
      return;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    if (!packageJson.sparkle_config) {
      log('No sparkle_config in package.json - skipping worktree_path check');
      return;
    }

    // Check if worktree_path is missing
    if (!packageJson.sparkle_config.worktree_path) {
      log('Adding missing worktree_path to sparkle_config');
      packageJson.sparkle_config.worktree_path = '.sparkle-worktree';

      // Write back to package.json
      await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
      log('Updated package.json with worktree_path: .sparkle-worktree');
      console.log('Sparkle: Updated configuration to include worktree_path');
    } else {
      log(`worktree_path already set: ${packageJson.sparkle_config.worktree_path}`);
    }
  } catch (error) {
    log(`Error ensuring worktree_path: ${error.message}`);
    // Non-fatal - continue with postinstall
  }
}

/**
 * Main postinstall logic
 * - For fresh installs: launches configuration UI (or auto-configures from env vars)
 * - For existing installs: checks version and shuts down old daemon if needed
 */
async function main() {
  // Set up log file in git root
  try {
    const gitRoot = await getGitRoot();
    logFilePath = join(gitRoot, 'sparkle_install.log');
  } catch (error) {
    logFilePath = join(process.cwd(), 'sparkle_install.log');
  }

  log('Starting postinstall...');
  log(`Logging to: ${logFilePath}`);
  const hasConfig = await hasSparkleConfig();

  if (hasConfig) {
    // Config exists - ensure worktree_path is set
    log('Sparkle config found in package.json');

    // Add worktree_path if missing (for older configs)
    await ensureWorktreePath();

    // Check and shutdown if version changed (waits for request to be sent)
    await checkAndShutdownOldDaemon();

    log('Run "npx sparkle browser" to start Sparkle');
  } else {
    // No config - check if we should auto-configure from file
    log('No config found, checking for autoconfig file...');
    let autoConfigured = false;
    try {
      autoConfigured = await autoConfigureFromFile();
    } catch (error) {
      log(`Error in autoConfigureFromFile: ${error.message}`);
      log(`Stack: ${error.stack}`);
    }

    if (autoConfigured) {
      log('Headless configuration complete');
      console.log('Run "npx sparkle browser" to start Sparkle');
    } else {
      // No auto-config - launch configuration UI
      log('Fresh install detected, launching configuration...');
      console.log('Sparkle: Opening browser for first-time configuration...');

      const child = spawn(process.execPath, [join(__dirname, 'sparkle_installer.js')], {
        detached: true,
        stdio: 'ignore'
      });

      // Don't wait for the child process
      child.unref();
    }
  }

  log('Postinstall complete');
  // Exit naturally - let Node's event loop drain
}

main().catch(error => {
  console.error('Postinstall error:', error.message);
  // Don't fail the install, just exit naturally
});
