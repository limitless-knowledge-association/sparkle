/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status file commands - publish, remove, list and fetch status artifacts.
 *
 * Publishing is CLI-only by design: the browser can view status files but never
 * submit them. Content is read from stdin so redirects, pipes and heredocs all work:
 *
 *   npx sparkle add-status-file build-report.json < report.json
 *   ci-tool --report | npx sparkle add-status-file build-report.json
 *   npx sparkle add-status-file notes.txt <<'EOF'
 *   all green
 *   EOF
 */

import { hasJsonFlag, daemonRequest, daemonRawRequest, readStdin, printList } from '../lib/helpers.js';
import { validateStatusName } from '../../src/statusFileName.js';

/**
 * Report an error the way the rest of the CLI does, then exit non-zero.
 * @param {boolean} useJson - Whether --json was passed
 * @param {string} message - Error message
 */
function fail(useJson, message) {
  if (useJson) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

/**
 * Publish a status file, adding it if absent and replacing it wholesale if present.
 * @param {string} name - Status file name
 * @param {string} location - Optional data directory location
 */
export async function addStatusFileCommand(name, location) {
  const useJson = hasJsonFlag();

  // Validate the name BEFORE touching stdin. readStdin() blocks until stdin closes, so
  // validating afterwards means a bad name hangs forever instead of failing — which for
  // an unattended CI publisher looks like a wedged build, not a rejected name.
  try {
    validateStatusName(name);
  } catch (error) {
    fail(useJson, error.message);
  }

  const text = await readStdin();
  if (text === null || text === undefined || text.length === 0) {
    fail(useJson, 'Status file content is required (read from stdin)');
  }

  let result;
  try {
    result = await daemonRequest(location, '/api/statusFiles/add', 'POST', { name, text });
  } catch (error) {
    fail(useJson, error.message);
  }

  if (useJson) {
    console.log(JSON.stringify({ success: true, ...result }));
  } else {
    console.log(`Status file ${result.created ? 'added' : 'updated'}: ${name}`);
  }
}

/**
 * Remove a published status file. Removing one that was never published is an error.
 * @param {string} name - Status file name
 * @param {string} location - Optional data directory location
 */
export async function removeStatusFileCommand(name, location) {
  const useJson = hasJsonFlag();

  if (!name) {
    fail(useJson, 'Status file name is required');
  }

  try {
    await daemonRequest(location, '/api/statusFiles/remove', 'POST', { name });
  } catch (error) {
    fail(useJson, error.message);
  }

  if (useJson) {
    console.log(JSON.stringify({ success: true, name }));
  } else {
    console.log(`Status file removed: ${name}`);
  }
}

/**
 * List published status files with size and last-modified time.
 * @param {string} location - Optional data directory location
 */
export async function listStatusFilesCommand(location) {
  const useJson = hasJsonFlag();

  const res = await daemonRequest(location, '/api/statusFiles', 'GET');

  printList(useJson, res, res.files, (file) =>
    `${file.name}\t${file.size}\t${file.modified}`
  );
}

/**
 * Print a published status file to stdout.
 * @param {string} name - Status file name
 * @param {string} location - Optional data directory location
 */
export async function fetchStatusFileCommand(name, location) {
  const useJson = hasJsonFlag();

  if (!name) {
    fail(useJson, 'Status file name is required');
  }

  let content;
  try {
    // Raw: a published .json file must come back exactly as published, not reparsed
    // and reformatted.
    content = await daemonRawRequest(location, `/api/statusFile?name=${encodeURIComponent(name)}`);
  } catch (error) {
    fail(useJson, error.message);
  }

  if (useJson) {
    console.log(JSON.stringify({ name, text: content }));
  } else {
    // Unadorned, so it can be redirected straight into a file.
    process.stdout.write(content);
  }
}
