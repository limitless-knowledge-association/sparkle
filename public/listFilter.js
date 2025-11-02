/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * List filtering logic for Sparkle list view
 * Extracted into a module for unit testing
 */

/**
 * Filter items by pending status
 * @param {Array} items - Array of item objects with {itemId, tagline, status, created}
 * @param {Set} pendingItemIds - Set of item IDs that are pending
 * @param {string} filterValue - 'all' | 'pending' | 'not-pending'
 * @returns {Array} Filtered items
 */
export function filterByPendingStatus(items, pendingItemIds, filterValue) {
  if (filterValue === 'pending') {
    return items.filter(item => pendingItemIds.has(item.itemId));
  } else if (filterValue === 'not-pending') {
    return items.filter(item => !pendingItemIds.has(item.itemId));
  }
  // 'all' means no filtering
  return items;
}

/**
 * Filter items by monitor status
 * @param {Array} items - Array of item objects
 * @param {Map} itemDetailsCache - Map of itemId -> item details (must include monitors array)
 * @param {string} currentUserEmail - Email of current user
 * @param {string} filterValue - 'all' | 'monitored' | 'not-monitored'
 * @returns {Array} Filtered items
 */
export function filterByMonitorStatus(items, itemDetailsCache, currentUserEmail, filterValue) {
  if (filterValue === 'all') {
    return items;
  }

  const isItemMonitored = (itemId) => {
    const details = itemDetailsCache.get(itemId);
    if (!details || !details.monitors) {
      return false;
    }
    return details.monitors.some(monitor => monitor.email === currentUserEmail);
  };

  if (filterValue === 'monitored') {
    return items.filter(item => isItemMonitored(item.itemId));
  } else if (filterValue === 'not-monitored') {
    return items.filter(item => !isItemMonitored(item.itemId));
  }

  return items;
}

/**
 * Filter items by ignored status
 * @param {Array} items - Array of item objects
 * @param {Map} itemDetailsCache - Map of itemId -> item details (must include ignored field)
 * @param {string} filterValue - 'all' | 'ignored' | 'not-ignored'
 * @returns {Array} Filtered items
 */
export function filterByIgnoredStatus(items, itemDetailsCache, filterValue) {
  if (filterValue === 'all') {
    return items;
  }

  const isItemIgnored = (itemId) => {
    const details = itemDetailsCache.get(itemId);
    if (!details) {
      return false;
    }
    return details.ignored === true;
  };

  if (filterValue === 'ignored') {
    return items.filter(item => isItemIgnored(item.itemId));
  } else if (filterValue === 'not-ignored') {
    return items.filter(item => !isItemIgnored(item.itemId));
  }

  return items;
}

/**
 * Filter items by taken-by status
 * @param {Array} items - Array of item objects
 * @param {Map} itemDetailsCache - Map of itemId -> item details (must include takenBy field)
 * @param {string} filterValue - Person email, 'all', 'taken', or 'not-taken'
 * @returns {Array} Filtered items
 */
export function filterByTakenStatus(items, itemDetailsCache, filterValue) {
  if (filterValue === 'all') {
    return items;
  }

  if (filterValue === 'taken') {
    return items.filter(item => {
      const details = itemDetailsCache.get(item.itemId);
      return details && details.takenBy !== null && details.takenBy !== undefined;
    });
  }

  if (filterValue === 'not-taken') {
    return items.filter(item => {
      const details = itemDetailsCache.get(item.itemId);
      return !details || !details.takenBy;
    });
  }

  // Filter by specific person's email
  return items.filter(item => {
    const details = itemDetailsCache.get(item.itemId);
    return details && details.takenBy && details.takenBy.email === filterValue;
  });
}

/**
 * Filter items by text search
 * Searches in concatenated itemId + tagline
 * @param {Array} items - Array of item objects
 * @param {string} searchText - Text to search for
 * @returns {Array} Filtered items
 */
export function filterByText(items, searchText) {
  if (!searchText || searchText.trim() === '') {
    return items;
  }

  const trimmedText = searchText.trim();
  const lowerFilter = trimmedText.toLowerCase();

  return items.filter(item => {
    // Search in concatenated itemId + tagline
    const searchableText = (item.itemId + item.tagline).toLowerCase();
    return searchableText.includes(lowerFilter);
  });
}

/**
 * Apply all filters in sequence
 * @param {Array} items - Array of item objects
 * @param {Object} options - Filter options
 * @param {Set} options.pendingItemIds - Set of pending item IDs
 * @param {string} options.pendingFilter - 'all' | 'pending' | 'not-pending'
 * @param {Map} options.itemDetailsCache - Map of item details
 * @param {string} options.currentUserEmail - Current user's email
 * @param {string} options.monitorFilter - 'all' | 'monitored' | 'not-monitored'
 * @param {string} options.ignoredFilter - 'all' | 'ignored' | 'not-ignored'
 * @param {string} options.takenFilter - 'all' | 'taken' | 'not-taken' | person email
 * @param {string} options.searchText - Text search query
 * @returns {Array} Filtered items
 */
export function applyAllFilters(items, options) {
  let filtered = items;

  // Apply filters in sequence
  filtered = filterByPendingStatus(
    filtered,
    options.pendingItemIds || new Set(),
    options.pendingFilter || 'all'
  );

  filtered = filterByMonitorStatus(
    filtered,
    options.itemDetailsCache || new Map(),
    options.currentUserEmail || '',
    options.monitorFilter || 'all'
  );

  filtered = filterByIgnoredStatus(
    filtered,
    options.itemDetailsCache || new Map(),
    options.ignoredFilter || 'not-ignored'
  );

  filtered = filterByTakenStatus(
    filtered,
    options.itemDetailsCache || new Map(),
    options.takenFilter || 'all'
  );

  filtered = filterByText(
    filtered,
    options.searchText || ''
  );

  return filtered;
}
