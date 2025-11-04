#!/usr/bin/env node

/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle Installer - First-time configuration tool
 * Runs during postinstall to configure Sparkle in a new repository
 *
 * Behavior:
 * - Starts minimal HTTP server on ephemeral port
 * - Opens browser to configuration UI
 * - Handles /api/configure endpoint to create worktree and update package.json
 * - Shuts down after configuration completes
 */

import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname, isAbsolute, basename } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import {
  getGitRoot,
  branchExists,
  initializeSparkleWorktree,
  checkOriginRemote
} from '../src/gitBranchOps.js';
import { openBrowser } from '../src/browserLauncher.js';
import { SPARKLE_VERSION } from '../src/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// State
let gitRoot;
let server = null;

/**
 * Parse request body as JSON
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

/**
 * Send static file from public directory (with security checks)
 */
async function sendStaticFile(res, requestPath) {
  try {
    // Security: Prevent directory traversal attacks
    // Remove leading slash
    const cleanPath = requestPath.replace(/^\/+/, '');

    // Check for directory traversal attempts
    if (cleanPath.includes('..') || cleanPath.includes('\\')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Build the file path
    const publicDir = join(__dirname, '../public');
    const filePath = join(publicDir, cleanPath);

    // Security: Verify the resolved path is actually within public directory
    const { resolve } = await import('path');
    const resolvedFilePath = resolve(filePath);
    const resolvedPublicDir = resolve(publicDir);

    if (!resolvedFilePath.startsWith(resolvedPublicDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Determine content type based on file extension
    let contentType = 'text/plain';
    if (cleanPath.endsWith('.html')) {
      contentType = 'text/html';
    } else if (cleanPath.endsWith('.css')) {
      contentType = 'text/css';
    } else if (cleanPath.endsWith('.js')) {
      contentType = 'application/javascript';
    } else if (cleanPath.endsWith('.json')) {
      contentType = 'application/json';
    } else if (cleanPath.endsWith('.png')) {
      contentType = 'image/png';
    } else if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (cleanPath.endsWith('.svg')) {
      contentType = 'image/svg+xml';
    } else if (cleanPath.endsWith('.ico')) {
      contentType = 'image/x-icon';
    }

    // Read and send the file
    const content = await readFile(filePath);
    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    };

    // Add version header for HTML files
    if (contentType === 'text/html') {
      headers['X-Sparkle-Version'] = SPARKLE_VERSION;
    }

    res.writeHead(200, headers);
    res.end(content);
  } catch (error) {
    // File not found or read error
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

/**
 * Get repository name for package.json
 */
async function getRepositoryName() {
  // Try to get from git remote origin URL
  try {
    const { execAsync } = await import('../src/execUtils.js');
    const { stdout } = await execAsync('git remote get-url origin', { cwd: gitRoot });
    const url = stdout.trim();

    // Extract repo name from URL (handle various formats)
    // - git@github.com:user/repo.git
    // - https://github.com/user/repo.git
    // - https://github.com/user/repo
    const match = url.match(/\/([^/]+?)(\.git)?$/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (error) {
    // Git remote not configured or error - use fallback
  }

  // Fallback: use the git root directory basename
  return basename(gitRoot);
}

/**
 * Update package.json with Sparkle configuration
 */
async function updatePackageJson(sparkleConfig) {
  const packageJsonPath = join(gitRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  // Add name field if it doesn't exist (prevents npm from inferring from directory name)
  if (!packageJson.name) {
    packageJson.name = await getRepositoryName();
  }

  // Add sparkle_config
  packageJson.sparkle_config = sparkleConfig;

  // Write back with nice formatting
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
}

/**
 * Check if Sparkle is installed as a regular dependency (should be devDependency)
 */
async function checkDependencyType() {
  try {
    const packageJsonPath = join(gitRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    // Check if sparkle is in dependencies (not recommended)
    const inDependencies = packageJson.dependencies && packageJson.dependencies.sparkle;
    const inDevDependencies = packageJson.devDependencies && packageJson.devDependencies.sparkle;

    // Get the package specifier (e.g., "file:sparkle-1.0.299.tgz")
    const packageSpec = inDependencies || inDevDependencies || null;

    return {
      isRegularDependency: !!inDependencies,
      isDevDependency: !!inDevDependencies,
      packageSpec: packageSpec
    };
  } catch (error) {
    return { isRegularDependency: false, isDevDependency: false, packageSpec: null };
  }
}

/**
 * Handle HTTP requests
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Check dependency type endpoint (for UI warning)
  if (path === '/api/checkDependency') {
    const depType = await checkDependencyType();
    sendJSON(res, 200, depType);
    return;
  }

  // Configuration endpoint
  if (path === '/api/configure' && req.method === 'POST') {
    const body = await parseBody(req);
    const { git_branch, directory, worktree_path } = body;

    if (!git_branch || !directory) {
      sendJSON(res, 400, { error: 'Missing required fields' });
      return;
    }

    // Set default worktree_path if not provided (backward compatibility)
    const finalWorktreePath = worktree_path || '.sparkle-worktree';

    // Validate directory is relative (cross-platform check)
    if (isAbsolute(directory) || directory.includes('..')) {
      sendJSON(res, 400, { error: 'Directory must be a relative path' });
      return;
    }

    // Validate worktree_path is relative (cross-platform check)
    if (isAbsolute(finalWorktreePath) || finalWorktreePath.includes('..')) {
      sendJSON(res, 400, { error: 'Worktree path must be a relative path' });
      return;
    }

    // Check if origin remote exists and is accessible
    const originCheck = await checkOriginRemote(gitRoot);
    if (!originCheck.exists || !originCheck.isAccessible) {
      sendJSON(res, 400, { error: originCheck.error });
      return;
    }

    // Check if branch already exists
    const exists = await branchExists(gitRoot, git_branch);
    if (exists.local || exists.remote) {
      sendJSON(res, 400, { error: `Branch ${git_branch} already exists` });
      return;
    }

    try {
      // Use the single entry point function for complete initialization
      await initializeSparkleWorktree(gitRoot, git_branch, directory, finalWorktreePath);

      // Save configuration to package.json
      const config = { git_branch, directory, worktree_path: finalWorktreePath };
      await updatePackageJson(config);

      sendJSON(res, 200, {
        success: true,
        message: 'Sparkle initialized successfully. Please commit the package.json changes.',
        postinstall: true  // Signal to UI that installer will shut down
      });

      // Shut down after a brief delay to allow UI to update
      setTimeout(() => {
        console.log('Configuration complete. Shutting down installer...');
        server.close(() => process.exit(0));
      }, 3000);

    } catch (error) {
      sendJSON(res, 500, { error: error.message });
    }
    return;
  }

  // Serve JavaScript files from src and public directories
  if ((path.startsWith('/src/') || path.startsWith('/public/')) && path.endsWith('.js')) {
    try {
      const filePath = join(__dirname, '..', path);
      const content = await readFile(filePath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
      return;
    } catch (error) {
      console.log(`Failed to serve ${path}:`, error.message);
    }
  }

  // Serve static files from public directory
  if (!path.startsWith('/api/')) {
    await sendStaticFile(res, path);
    return;
  }

  // Not found
  sendJSON(res, 404, { error: 'Not found' });
}

/**
 * Main function
 */
async function main() {
  console.log('Sparkle Installer starting...');

  // Get git root
  gitRoot = await getGitRoot();
  console.log(`Git root: ${gitRoot}`);

  // Create HTTP server
  server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (error) {
      console.error('Request error:', error);
      sendJSON(res, 500, { error: error.message });
    }
  });

  // Start server on ephemeral port
  server.listen(0, 'localhost', async () => {
    const address = server.address();
    const port = address.port;

    console.log(`Sparkle Installer listening on http://localhost:${port}`);
    console.log(`Sparkle version: ${SPARKLE_VERSION}`);
    console.log('Opening browser for configuration...');

    // Open browser to configuration page
    await openBrowser(`http://localhost:${port}/configuration.html`);
  });

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    console.log('\nShutting down installer...');
    server.close(() => {
      console.log('Installer stopped.');
      process.exit(0);
    });
  });
}

// Only start the installer if this module is being run directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('Installer error:', error);
    process.exit(1);
  });
}
