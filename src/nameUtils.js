/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 */

import crypto from 'crypto';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

// Track last timestamp to prevent collisions
let lastTimestamp = null;

/**
 * Generate a random 8-digit item ID that doesn't start with 0
 * @returns {string} 8-digit item ID (10000000-99999999)
 */
export function generateItemId() {
  return String(Math.floor(Math.random() * 90000000) + 10000000);
}

/**
 * Generate a timestamp in YYYYMMDDHHmmssSSS format (with milliseconds)
 * @param {Date} [date] - Optional Date object to use (defaults to now)
 * @returns {string} Timestamp string
 */
export function generateTimestamp(date = null) {
  const now = date || new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  const ms = String(now.getUTCMilliseconds()).padStart(3, '0');

  return `${year}${month}${day}${hour}${minute}${second}${ms}`;
}

/**
 * Convert filename timestamp (YYYYMMDDHHmmssSSS) to ISO 8601 format
 * @param {string} filenameTimestamp - Timestamp in YYYYMMDDHHmmssSSS format
 * @returns {string} ISO 8601 timestamp with milliseconds
 */
export function filenameTimestampToISO(filenameTimestamp) {
  // Parse: YYYYMMDDHHmmssSSS (17 characters)
  const year = filenameTimestamp.substring(0, 4);
  const month = filenameTimestamp.substring(4, 6);
  const day = filenameTimestamp.substring(6, 8);
  const hour = filenameTimestamp.substring(8, 10);
  const minute = filenameTimestamp.substring(10, 12);
  const second = filenameTimestamp.substring(12, 14);
  const ms = filenameTimestamp.substring(14, 17);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`;
}

/**
 * Generate a random 4-character string from [a-zA-Z0-9]
 * @returns {string} Random string
 */
export function generateRandomString() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a filename with timestamp and random component
 * Prevents timestamp collisions by sleeping 1ms if needed
 * @param {string} itemId - Item identifier
 * @param {string} type - File type (e.g., 'tagline', 'entry', 'status')
 * @param {string} [suffix=''] - Optional suffix for the filename
 * @returns {Promise<{filename: string, isoTimestamp: string}>} Object with filename and ISO timestamp
 */
export async function generateFilename(itemId, type, suffix = '') {
  let now = new Date();
  let timestamp = generateTimestamp(now);

  // Prevent timestamp collisions by sleeping if needed
  if (lastTimestamp === timestamp) {
    await sleep(1);
    now = new Date();
    timestamp = generateTimestamp(now);
  }

  lastTimestamp = timestamp;

  const isoTimestamp = now.toISOString();
  const random = generateRandomString();

  let filename;
  if (suffix) {
    filename = `${itemId}.${type}.${suffix}.${timestamp}.${random}.json`;
  } else {
    filename = `${itemId}.${type}.${timestamp}.${random}.json`;
  }

  return { filename, isoTimestamp };
}

/**
 * Generate SHA256 hash of an object (for monitor identification)
 * @param {Object} obj - Object to hash
 * @param {number} [length=8] - Length of truncated hash
 * @returns {string} Truncated hex hash
 */
export function hashObject(obj, length = 8) {
  const str = JSON.stringify(obj);
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return hash.substring(0, length);
}
