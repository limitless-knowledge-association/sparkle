/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Port file (last_port.data) - single owner of the format and its staleness rules.
 *
 * FORMAT: JSON — {"port": 54321, "pid": 6789, "startedAt": "<iso>"}
 *
 * It used to be a bare integer, and eight separate call sites each did their own
 * `parseInt(readFileSync(...))`. The bare port alone cannot distinguish "daemon running"
 * from "daemon died and left the file behind", so callers either pinged the port (slow,
 * and ambiguous if something else grabbed it) or simply assumed a present file meant a
 * live daemon — which is why `sparkle-halt` and the installer could report a running
 * daemon that had crashed hours earlier.
 *
 * Recording the launching PID lets a reader ask the OS directly whether the owner still
 * exists, and delete the file when it provably does not.
 *
 * LEGACY FILES: a bare-integer file was written by an older Sparkle. It is handled by
 * shutting that daemon down (if it still answers) and deleting the file, so any mix of
 * old and new installs converges on the new format.
 *
 * WINDOWS: process.kill(pid, 0) sends no signal on any platform; libuv implements it on
 * Windows as an OpenProcess existence probe. Verified outcomes are identical across
 * platforms: success = alive, ESRCH = gone, EPERM = exists but owned by another user.
 * EPERM is treated as "not our daemon" — our daemon always runs as the current user, so
 * an EPERM hit means the PID was recycled.
 *
 * PID REUSE: a live PID is not proof the process is our daemon, since the OS recycles
 * PIDs (aggressively on Windows). The HTTP ping therefore remains the authority for
 * "may I use this port"; the PID is only the authority for "may I delete this file".
 */

import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import http from 'http';

export const PORT_FILE_NAME = 'last_port.data';

/**
 * @param {string} dataDir - Sparkle data directory
 * @returns {string} Absolute path to the port file
 */
export function getPortFilePath(dataDir) {
  return join(dataDir, PORT_FILE_NAME);
}

/**
 * Read and parse the port file, tolerating the legacy bare-integer format.
 *
 * @param {string} dataDir - Sparkle data directory
 * @returns {Promise<{port: number, pid: number|null, legacy: boolean}|null>}
 *   null when the file is absent or unparseable.
 */
export async function readPortFile(dataDir) {
  const portFilePath = getPortFilePath(dataDir);

  if (!existsSync(portFilePath)) {
    return null;
  }

  let raw;
  try {
    raw = (await readFile(portFilePath, 'utf8')).trim();
  } catch (error) {
    return null;
  }

  if (!raw) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    parsed = undefined;
  }

  // A legacy file holds a bare integer — and JSON.parse ACCEPTS that, returning a Number
  // rather than throwing. So the legacy check cannot be "did JSON.parse fail"; it has to
  // be "is the result an object". Getting this wrong made every legacy file read as
  // unparseable, so it was never retired and the old daemon was never shut down.
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const port = Number(parsed.port);
    if (!Number.isInteger(port) || port <= 0) {
      return null;
    }
    const pid = Number.isInteger(Number(parsed.pid)) ? Number(parsed.pid) : null;
    return { port, pid, legacy: false };
  }

  // Bare integer (parsed as a Number, or not JSON at all) — written by an older Sparkle.
  const port = parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }
  return { port, pid: null, legacy: true };
}

/**
 * Write the port file in the current format.
 *
 * @param {string} dataDir - Sparkle data directory
 * @param {number} port - Port the daemon is listening on
 * @param {number} [pid] - Owning process id (defaults to this process)
 */
export async function writePortFile(dataDir, port, pid = process.pid) {
  const contents = JSON.stringify({
    port,
    pid,
    startedAt: new Date().toISOString()
  });
  await writeFile(getPortFilePath(dataDir), contents, 'utf8');
}

/**
 * Delete the port file. Safe to call when it does not exist.
 * @param {string} dataDir - Sparkle data directory
 * @returns {Promise<boolean>} True if a file was removed
 */
export async function deletePortFile(dataDir) {
  const portFilePath = getPortFilePath(dataDir);
  if (!existsSync(portFilePath)) {
    return false;
  }
  try {
    await unlink(portFilePath);
    return true;
  } catch (error) {
    // Another process may have removed it between the check and the unlink.
    return false;
  }
}

/**
 * Ask the OS whether a process exists, without signalling it.
 *
 * @param {number} pid
 * @returns {boolean} True only if the process exists AND is owned by this user.
 */
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0); // signal 0 = existence probe, never terminates
    return true;
  } catch (error) {
    // ESRCH: no such process. EPERM: exists but owned by another user, so it is not our
    // daemon and the PID has been recycled. Both mean "the daemon we recorded is gone".
    return false;
  }
}

/**
 * Ask a daemon on `port` to shut down. Best effort, short timeout.
 * @param {number} port
 * @returns {Promise<boolean>} True if the shutdown request was accepted
 */
function requestShutdown(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/api/shutdown',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Retire a legacy (bare-integer) port file.
 *
 * A bare-integer file means an OLDER Sparkle wrote it, and that daemon does not know
 * about the current format. Shut it down if it still answers, then delete the file so the
 * next launch writes a fresh JSON one. This is what lets any mix of old and new installs
 * converge on the new format instead of ping-ponging between them.
 *
 * @param {string} dataDir - Sparkle data directory
 * @param {number} port - Port recorded in the legacy file
 * @returns {Promise<void>}
 */
export async function retireLegacyPortFile(dataDir, port) {
  console.error(`[portFile] Legacy port file found (port ${port}) — shutting down the old daemon and removing it`);

  const accepted = await requestShutdown(port);
  if (accepted) {
    // Give it a moment to release the port before anyone tries to bind it.
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await deletePortFile(dataDir);
}

/**
 * Read the port file and drop it if its owning process is provably gone.
 *
 * This is the staleness check callers want before trusting a recorded port. It does NOT
 * confirm the daemon is responsive — ping it for that — it only removes files whose owner
 * no longer exists, so a crashed daemon stops masquerading as a running one.
 *
 * A legacy file has no PID to check and is left in place; use resolveLegacyPortFile() to
 * retire it, since that requires shutting the old daemon down first.
 *
 * @param {string} dataDir - Sparkle data directory
 * @returns {Promise<{port: number, pid: number|null, legacy: boolean}|null>}
 */
export async function readLivePortFile(dataDir) {
  const info = await readPortFile(dataDir);
  if (!info) {
    return null;
  }

  if (info.legacy || info.pid === null) {
    // No PID recorded, so staleness cannot be decided here.
    return info;
  }

  if (!isProcessAlive(info.pid)) {
    console.error(`[portFile] Daemon process ${info.pid} is gone — removing stale port file`);
    await deletePortFile(dataDir);
    return null;
  }

  return info;
}
