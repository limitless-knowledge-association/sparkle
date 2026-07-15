/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status file name encoding.
 *
 * A status file is published under an arbitrary user-supplied name, but it has to
 * become a real file on macOS, Linux and Windows. Plain encodeURIComponent is NOT
 * sufficient — it leaves five hazards intact:
 *
 *   '..'           -> '..'         path traversal
 *   'CON' / 'aux'  -> unchanged    Windows reserved device names (uncreatable)
 *   'star*name'    -> unchanged    '*' is illegal on Windows
 *   'trailingdot.' -> unchanged    Windows silently strips trailing dots
 *   'Build'/'build'                distinct names, SAME file on case-insensitive
 *                                  APFS/NTFS
 *
 * So we percent-encode against a strict allowlist using LOWERCASE hex. Because the
 * output alphabet is then entirely lowercase, two names differing only by case encode
 * to different all-lowercase filenames and can never collide on a case-insensitive
 * filesystem.
 *
 * Readable names stay readable: 'build-report.json' encodes to itself.
 */

/** Characters that may appear literally. Note: no uppercase — see above. */
const SAFE_CHAR = /[a-z0-9\-_.]/;

/** Windows reserved device names, matched against the stem (text before the first dot). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/**
 * Longest permitted encoded name. Filesystems cap a single component at 255 bytes;
 * encoding can triple length, so the cap is applied to the ENCODED form.
 */
const MAX_ENCODED_BYTES = 200;

const DEL_CODE_POINT = 0x7f;
const FIRST_PRINTABLE_CODE_POINT = 0x20;

const encodeByte = (byte) => '%' + byte.toString(16).padStart(2, '0');

/**
 * Encode a status file name into a filename that is safe on all supported platforms.
 * @param {string} name - Raw, user-supplied status file name
 * @returns {string} Encoded filename (flat, lowercase, no path separators)
 * @throws {Error} If the name cannot be represented safely
 */
export function encodeStatusName(name) {
  validateStatusName(name);

  let encoded = '';
  for (const char of name) {
    if (SAFE_CHAR.test(char)) {
      encoded += char;
    } else {
      for (const byte of Buffer.from(char, 'utf8')) encoded += encodeByte(byte);
    }
  }

  // A leading dot would produce '.', '..' or a hidden file; a trailing dot is silently
  // stripped by Windows, which would alias two distinct names onto one file.
  if (encoded.startsWith('.')) encoded = '%2e' + encoded.slice(1);
  if (encoded.endsWith('.')) encoded = encoded.slice(0, -1) + '%2e';

  // 'con', 'con.txt', 'aux' ... cannot be created on Windows at all. Escaping the first
  // character keeps the name unique and reversible while dodging the device namespace.
  if (WINDOWS_RESERVED.test(encoded.split('.')[0])) {
    encoded = encodeByte(encoded.charCodeAt(0)) + encoded.slice(1);
  }

  if (Buffer.byteLength(encoded) > MAX_ENCODED_BYTES) {
    throw new Error(
      `Status file name too long: '${name}' encodes to ${Buffer.byteLength(encoded)} bytes ` +
      `(limit ${MAX_ENCODED_BYTES})`
    );
  }

  return encoded;
}

/**
 * Recover the original name from an encoded filename.
 * @param {string} encoded - Encoded filename as stored on disk
 * @returns {string} The original status file name
 */
export function decodeStatusName(encoded) {
  return decodeURIComponent(encoded);
}

/**
 * Reject names that are nonsense before they ever reach the encoder, so the caller gets
 * a clear error instead of a silently mangled filename. In particular a sub-directory
 * attempt fails loudly rather than encoding to 'ci%2fbuild.json'.
 * @param {string} name - Raw, user-supplied status file name
 * @throws {Error} With a message suitable for direct display to a CLI user
 */
export function validateStatusName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Status file name is required');
  }
  if (name.includes('/') || name.includes('\\')) {
    throw new Error(
      `Status file name cannot contain a path separator: '${name}'. ` +
      'Status files are a flat collection; sub-directories are not supported.'
    );
  }
  if (name === '.' || name === '..') {
    throw new Error(`Invalid status file name: '${name}'`);
  }
  for (const char of name) {
    const codePoint = char.codePointAt(0);
    if (codePoint < FIRST_PRINTABLE_CODE_POINT || codePoint === DEL_CODE_POINT) {
      throw new Error('Status file name cannot contain control characters');
    }
  }
}
