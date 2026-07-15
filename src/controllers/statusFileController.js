/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status File Controller - publishing arbitrary status artifacts (CI reports etc.)
 *
 * NOTE ON NAMING: 'status' is already two other things in this codebase — an item's
 * status (incomplete/completed/custom, see statusController.js) and the daemon/branch
 * status (/api/status). Everything here is deliberately named statusFile to keep those
 * three apart.
 *
 * Unlike every other Sparkle write, a status file is NOT an append-only event: it is a
 * mutable file replaced wholesale on each submission. The bytes on disk are always
 * exactly what a publisher submitted — never a merge of two submissions. See
 * GitOperations for how that invariant survives concurrent clones.
 */

import { readdir, readFile, writeFile, rename, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { ensureDir } from '../fileUtils.js';
import { encodeStatusName, decodeStatusName, validateStatusName } from '../statusFileName.js';

/** Directory (relative to the sparkle data dir) holding published status files. */
export const STATUS_DIR = 'status';

/** Largest status file we accept. Every version lives in git history forever. */
export const MAX_STATUS_BYTES = 5 * 1024 * 1024;

/** A NUL byte marks content as binary; this is how git itself decides. */
const NUL = String.fromCharCode(0);

/**
 * Resolve the status directory for a data directory.
 * @param {string} baseDirectory - Base directory for sparkle data
 * @returns {string} Absolute path to the status directory
 */
export function getStatusDir(baseDirectory) {
  return join(baseDirectory, STATUS_DIR);
}

/**
 * Reject content we refuse to publish. Content arrives as a JS string, so invalid UTF-8
 * cannot survive the trip; a NUL can, and would corrupt both the browser view and the diff.
 * @param {string} text - Candidate status file content
 * @throws {Error} With a message suitable for direct display to a CLI user
 */
function validateStatusContent(text) {
  if (typeof text !== 'string') {
    throw new Error('Status file content must be text');
  }
  if (text.includes(NUL)) {
    throw new Error('Status file content must be text (binary content is not supported)');
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_STATUS_BYTES) {
    throw new Error(`Status file too large: ${bytes} bytes (limit ${MAX_STATUS_BYTES})`);
  }
}

/**
 * Publish a status file, adding it if absent and replacing it wholesale if present.
 *
 * The write is atomic (temp file + rename) so a reader or a concurrent `git add` can
 * never observe a half-written report.
 *
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} name - Status file name (raw, as supplied by the publisher)
 * @param {string} text - Full file content; replaces any previous content
 * @returns {Promise<{name: string, created: boolean, bytes: number}>}
 */
export async function addStatusFile(baseDirectory, name, text) {
  validateStatusContent(text);
  const encoded = encodeStatusName(name);

  const statusDir = getStatusDir(baseDirectory);
  await ensureDir(statusDir);

  const filePath = join(statusDir, encoded);
  const created = !existsSync(filePath);

  // Unique temp name: two publishers writing the same file concurrently must not land
  // on the same temp path and interleave.
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now().toString(36)}`;
  try {
    await writeFile(tempPath, text, 'utf8');
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }

  return { name, created, bytes: Buffer.byteLength(text, 'utf8') };
}

/**
 * Remove a published status file.
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} name - Status file name (raw, as supplied by the publisher)
 * @returns {Promise<{name: string}>}
 * @throws {Error} If no such status file exists
 */
export async function removeStatusFile(baseDirectory, name) {
  const encoded = encodeStatusName(name);
  const filePath = join(getStatusDir(baseDirectory), encoded);

  if (!existsSync(filePath)) {
    throw new Error(`Status file not found: ${name}`);
  }

  await unlink(filePath);
  return { name };
}

/**
 * List published status files, newest change first.
 * @param {string} baseDirectory - Base directory for sparkle data
 * @returns {Promise<Array<{name: string, size: number, modified: string}>>}
 */
export async function listStatusFiles(baseDirectory) {
  const statusDir = getStatusDir(baseDirectory);
  if (!existsSync(statusDir)) return [];

  const entries = await readdir(statusDir).catch(() => []);
  const files = [];

  for (const encoded of entries) {
    // Skip our own in-flight atomic writes.
    if (encoded.includes('.tmp.')) continue;

    let name;
    try {
      name = decodeStatusName(encoded);
    } catch {
      // Not something we wrote; ignore rather than fail the whole listing.
      continue;
    }

    const fileStat = await stat(join(statusDir, encoded)).catch(() => null);
    if (!fileStat || !fileStat.isFile()) continue;

    files.push({ name, size: fileStat.size, modified: fileStat.mtime.toISOString() });
  }

  files.sort((a, b) => b.modified.localeCompare(a.modified) || a.name.localeCompare(b.name));
  return files;
}

/**
 * Read a published status file.
 * @param {string} baseDirectory - Base directory for sparkle data
 * @param {string} name - Status file name (raw, as supplied by the publisher)
 * @returns {Promise<string>} The file content
 * @throws {Error} If no such status file exists
 */
export async function readStatusFile(baseDirectory, name) {
  const encoded = encodeStatusName(name);
  const filePath = join(getStatusDir(baseDirectory), encoded);

  if (!existsSync(filePath)) {
    throw new Error(`Status file not found: ${name}`);
  }

  return readFile(filePath, 'utf8');
}

export { validateStatusName };
