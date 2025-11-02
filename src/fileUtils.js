/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 */

import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

/**
 * Ensure a directory exists
 * @param {string} dirPath - Directory path
 */
export async function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * Write a JSON file
 * @param {string} filePath - Full file path
 * @param {Object} data - Data to write
 */
export async function writeJsonFile(filePath, data) {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Read a JSON file
 * @param {string} filePath - Full file path
 * @returns {Promise<Object>} Parsed JSON data
 */
export async function readJsonFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Check if a file exists
 * @param {string} filePath - Full file path
 * @returns {boolean} True if file exists
 */
export function fileExists(filePath) {
  return existsSync(filePath);
}

/**
 * Read all files in a directory matching a pattern
 * @param {string} dirPath - Directory path
 * @param {string} pattern - Pattern to match (item ID prefix)
 * @returns {Promise<string[]>} Array of matching filenames
 */
export async function readMatchingFiles(dirPath, pattern) {
  try {
    if (!existsSync(dirPath)) {
      return [];
    }
    const files = await readdir(dirPath);
    return files.filter(file => file.startsWith(pattern) && file.endsWith('.json'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Remove a directory recursively
 * @param {string} dirPath - Directory path
 */
export async function removeDir(dirPath) {
  if (existsSync(dirPath)) {
    await rm(dirPath, { recursive: true, force: true });
  }
}

/**
 * Get all files for a specific item
 * @param {string} baseDir - Base directory for sparkle data
 * @param {string} itemId - Item ID
 * @returns {Promise<Object[]>} Array of {filename, data} objects
 */
export async function getItemFiles(baseDir, itemId) {
  const files = await readMatchingFiles(baseDir, itemId);
  const results = [];

  for (const filename of files) {
    const filePath = join(baseDir, filename);
    const data = await readJsonFile(filePath);
    results.push({ filename, data });
  }

  return results;
}
