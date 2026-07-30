/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Saved Views (client) — name the current on-screen state and return to it later.
 *
 * A saved view records which PAGE it belongs to plus an opaque state blob that the page
 * itself defines. Pages opt in by calling registerViewState() with a capture function and
 * an apply function; a page that never registers still works — selecting one of its saved
 * views simply navigates there with nothing extra to restore.
 *
 * Storage is server-side (<dataDir>/.aggregates/views.json, git-ignored), NOT
 * localStorage, so a saved view is reachable from any browser or profile pointed at this
 * repo. Selecting a view navigates to `<page>?view=<name>`, which is what makes a saved
 * view bookmarkable — note the bookmark only survives a daemon restart if a fixed port is
 * configured, since an ephemeral port changes the origin.
 */

import { apiCall } from './sparkle-common.js';

/** Query parameter that selects a saved view on load. */
export const VIEW_PARAM = 'view';

// Per-page hooks, registered by whichever page loaded this module.
let captureState = null;
let applyState = null;

/**
 * Register how this page captures and restores its own state.
 *
 * @param {Object} handlers
 * @param {Function} handlers.capture - () => Object, the state to store
 * @param {Function} handlers.apply - (state) => void|Promise, restore stored state
 */
export function registerViewState({ capture, apply }) {
  captureState = typeof capture === 'function' ? capture : null;
  applyState = typeof apply === 'function' ? apply : null;
}

/** @returns {string} The current page's filename, e.g. 'list_view.html' */
export function currentPage() {
  return window.location.pathname.split('/').pop() || 'list_view.html';
}

/**
 * Fetch all saved views.
 * @returns {Promise<Array<{name: string, page: string, state: Object}>>}
 *   Empty array on failure — a broken views file must not break the header.
 */
export async function listViews() {
  try {
    const result = await apiCall('/api/views');
    return Array.isArray(result.views) ? result.views : [];
  } catch (error) {
    console.error('savedViews: failed to load views:', error);
    return [];
  }
}

/**
 * Save the current page state under a name, replacing any view with that name.
 * @param {string} name
 * @returns {Promise<Array>} Updated view list
 */
export async function saveCurrentView(name) {
  const state = captureState ? captureState() : {};
  const result = await apiCall('/api/views/save', {
    name,
    page: currentPage(),
    state
  });
  return result.views || [];
}

/**
 * Delete a saved view by name.
 * @param {string} name
 * @returns {Promise<Array>} Updated view list
 */
export async function deleteView(name) {
  const result = await apiCall('/api/views/delete', { name });
  return result.views || [];
}

/**
 * Navigate to a saved view.
 *
 * Always goes through a URL rather than applying state in place, so the address bar
 * reflects the view and can be bookmarked or shared.
 *
 * @param {{name: string, page: string}} view
 */
export function goToView(view) {
  const target = `${view.page}?${VIEW_PARAM}=${encodeURIComponent(view.name)}`;

  // Assigning href navigates and the page's load-time applyViewFromUrl() does the rest,
  // so there is one code path for "arrive at a view" whether it came from the dropdown or
  // from a bookmark. Selecting the view you are already on is a no-op, which is correct.
  window.location.href = target;
}

/**
 * If the URL names a saved view, apply it to this page.
 *
 * Call once during page init, AFTER the page has registered its handlers and its data is
 * ready to be filtered.
 *
 * @returns {Promise<string|null>} The applied view's name, or null if none
 */
export async function applyViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get(VIEW_PARAM);

  if (!name) {
    return null;
  }

  const views = await listViews();
  const view = views.find(v => v.name.toLowerCase() === name.trim().toLowerCase());

  if (!view) {
    console.warn(`savedViews: no saved view named "${name}"`);
    return null;
  }

  if (view.page !== currentPage()) {
    // The bookmark points at a view belonging to a different page — go there instead of
    // applying state this page cannot interpret.
    goToView(view);
    return null;
  }

  if (applyState) {
    await applyState(view.state || {});
  }

  return view.name;
}
