/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Saved Views - named snapshots of on-screen state (filters, search, sort, page).
 *
 * STORED IN: <dataDir>/.aggregates/views.json
 *
 * That directory is git-ignored (see gitBranchOps.js, which writes `.aggregates/` into
 * the data directory's .gitignore), so saved views are local to the clone and never
 * committed — which is the requirement — while still being shared by every browser that
 * talks to this daemon.
 *
 * Deliberately NOT localStorage. localStorage is per-origin, and with an ephemeral port
 * the origin changes on every daemon restart, so saved views would silently vanish and a
 * bookmark could never find them. Keeping them server-side means a bookmarked
 * `list_view.html?view=<name>` resolves from any browser or profile against this repo.
 * (Bookmarks still require a fixed port to survive a restart — that is what the `port`
 * setting is for.)
 */

import { join } from 'path';
import { readJsonFile, writeJsonFile, fileExists, ensureDir } from './fileUtils.js';

/** Upper bound on stored views, to keep the dropdown usable and the file small. */
const MAX_VIEWS = 100;

/** Longest accepted view name. */
const MAX_NAME_LENGTH = 60;

function getViewsPath(baseDirectory) {
  return join(baseDirectory, '.aggregates', 'views.json');
}

/**
 * Normalize a user-supplied view name.
 * @param {string} name
 * @returns {string} Trimmed name
 * @throws {Error} If the name is empty or too long
 */
export function normalizeViewName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';

  if (!trimmed) {
    throw new Error('View name cannot be empty');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`View name cannot exceed ${MAX_NAME_LENGTH} characters`);
  }

  return trimmed;
}

/**
 * Load all saved views.
 *
 * @param {string} baseDirectory - Sparkle data directory
 * @returns {Promise<Array<{name: string, page: string, state: Object, savedAt: string}>>}
 *   Sorted by name. Always an array — a missing or corrupt file yields [] rather than
 *   throwing, because a broken views file must never stop the UI from loading.
 */
export async function loadViews(baseDirectory) {
  const viewsPath = getViewsPath(baseDirectory);

  if (!fileExists(viewsPath)) {
    return [];
  }

  try {
    const data = await readJsonFile(viewsPath);
    const views = Array.isArray(data?.views) ? data.views : [];

    return views
      .filter(v => v && typeof v.name === 'string' && v.name.trim())
      .map(v => ({
        name: v.name,
        page: typeof v.page === 'string' && v.page ? v.page : 'list_view.html',
        state: v.state && typeof v.state === 'object' ? v.state : {},
        savedAt: typeof v.savedAt === 'string' ? v.savedAt : null
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error loading saved views:', error.message);
    return [];
  }
}

/**
 * Look up one saved view by name (case-insensitive).
 * @param {string} baseDirectory - Sparkle data directory
 * @param {string} name
 * @returns {Promise<Object|null>}
 */
export async function getView(baseDirectory, name) {
  const target = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!target) {
    return null;
  }
  const views = await loadViews(baseDirectory);
  return views.find(v => v.name.toLowerCase() === target) || null;
}

/**
 * Create or replace a saved view.
 *
 * Names are matched case-insensitively so "Blocked" does not sit alongside "blocked";
 * saving over an existing name replaces it, which is what a user expects from "save".
 *
 * @param {string} baseDirectory - Sparkle data directory
 * @param {string} name - View name
 * @param {string} page - Page the view belongs to (e.g. 'list_view.html')
 * @param {Object} state - Opaque page state to restore
 * @returns {Promise<Array>} The full list of views after saving
 */
export async function saveView(baseDirectory, name, page, state) {
  const viewName = normalizeViewName(name);
  const views = await loadViews(baseDirectory);

  const existingIndex = views.findIndex(
    v => v.name.toLowerCase() === viewName.toLowerCase());

  if (existingIndex === -1 && views.length >= MAX_VIEWS) {
    throw new Error(`Cannot save more than ${MAX_VIEWS} views`);
  }

  const entry = {
    name: viewName,
    page: typeof page === 'string' && page ? page : 'list_view.html',
    state: state && typeof state === 'object' ? state : {},
    savedAt: new Date().toISOString()
  };

  if (existingIndex === -1) {
    views.push(entry);
  } else {
    views[existingIndex] = entry;
  }

  await persist(baseDirectory, views);
  return views.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Delete a saved view by name (case-insensitive).
 * @param {string} baseDirectory - Sparkle data directory
 * @param {string} name
 * @returns {Promise<{removed: boolean, views: Array}>}
 */
export async function deleteView(baseDirectory, name) {
  const target = typeof name === 'string' ? name.trim().toLowerCase() : '';
  const views = await loadViews(baseDirectory);
  const remaining = views.filter(v => v.name.toLowerCase() !== target);

  if (remaining.length === views.length) {
    return { removed: false, views };
  }

  await persist(baseDirectory, remaining);
  return { removed: true, views: remaining };
}

/**
 * Write the views file.
 * @private
 */
async function persist(baseDirectory, views) {
  const viewsPath = getViewsPath(baseDirectory);
  await ensureDir(join(baseDirectory, '.aggregates'));
  await writeJsonFile(viewsPath, { version: 1, views });
}
