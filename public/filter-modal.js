/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Filter Settings Modal Component
 * Provides a modal interface for configuring list view filters
 */

import { frontendLog } from './sparkle-common.js';

let filterModalInstance = null;
let takersCache = null; // Reference to TakersCache
let takersCacheUnsubscribe = null; // Unsubscribe function for cache updates

/**
 * Initialize the filter modal component with TakersCache
 * @param {TakersCache} cache - TakersCache instance to observe
 */
export function initializeFilterModal(cache) {
  takersCache = cache;

  // Subscribe to takers cache updates
  if (takersCache) {
    takersCacheUnsubscribe = takersCache.onChange(() => {
      handleTakersCacheUpdate();
    });
  }

  frontendLog('filter-modal: Initialized with TakersCache');
}

/**
 * Handle TakersCache update - refresh the taken filter dropdown if modal is open
 */
function handleTakersCacheUpdate() {
  if (!filterModalInstance || !filterModalInstance.isOpen) {
    // Modal not open, nothing to update
    return;
  }

  frontendLog('filter-modal: TakersCache updated, refreshing takers dropdown');

  // Get the current selected value before updating
  const takenSelect = document.getElementById('filterModal_takenFilter');
  if (!takenSelect) {
    return;
  }

  const currentValue = takenSelect.value;

  // Rebuild the dropdown options
  const takers = takersCache ? takersCache.getTakers() : [];
  const newOptions = buildTakenFilterOptions(takers);

  // Replace the options
  takenSelect.innerHTML = newOptions;

  // Restore the selected value if it still exists
  if (currentValue) {
    const optionExists = Array.from(takenSelect.options).some(opt => opt.value === currentValue);
    if (optionExists) {
      takenSelect.value = currentValue;
    }
  }
}

/**
 * Build the HTML options for the taken filter dropdown
 * @param {Array<Object>} takers - List of takers [{name, email, hash}]
 * @returns {string} HTML options string
 */
function buildTakenFilterOptions(takers) {
  let options = `
    <option value="all">All items (default)</option>
    <option value="taken">Taken by anyone</option>
    <option value="not-taken">Not taken</option>
  `;

  // Add options for each known taker
  if (takers.length > 0) {
    options += '<option disabled>──────────</option>';
    for (const taker of takers) {
      const escapedName = escapeHtml(taker.name);
      const escapedEmail = escapeHtml(taker.email);
      // Use email as the value since that's what the filter logic expects
      options += `<option value="${escapedEmail}">${escapedName}</option>`;
    }
  }

  return options;
}

/**
 * Open the filter settings modal
 * @param {Object} currentFilters - Current filter values
 * @param {Function} onApply - Callback when filters are applied
 */
export function openFilterModal(currentFilters, onApply) {
  if (filterModalInstance && filterModalInstance.isOpen) {
    frontendLog('filter-modal: Modal already open');
    return;
  }

  filterModalInstance = {
    currentFilters: { ...currentFilters },
    onApply: onApply,
    isOpen: true
  };

  // Get list of known takers from the cache
  const takers = takersCache ? takersCache.getTakers() : [];
  frontendLog(`filter-modal: Opening with ${takers.length} takers from cache`);

  createFilterModalDOM(takers);
  document.getElementById('filterModal').classList.add('show');
}

/**
 * Close the filter modal
 */
function closeFilterModal() {
  const modal = document.getElementById('filterModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.remove();
      if (filterModalInstance) {
        filterModalInstance.isOpen = false;
      }
      filterModalInstance = null;
    }, 300);
  }
}
window.closeFilterModal = closeFilterModal;

/**
 * Apply filter changes and close modal
 */
function applyFilters() {
  const filters = {
    pending: document.getElementById('filterModal_pendingFilter').value,
    monitor: document.getElementById('filterModal_monitorFilter').value,
    ignored: document.getElementById('filterModal_ignoredFilter').value,
    taken: document.getElementById('filterModal_takenFilter').value
  };

  if (filterModalInstance && filterModalInstance.onApply) {
    filterModalInstance.onApply(filters);
  }

  closeFilterModal();
}
window.applyFilters = applyFilters;

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create the filter modal DOM
 * @param {Array<Object>} takers - List of known takers [{name, email, hash}]
 */
function createFilterModalDOM(takers = []) {
  const takenFilterOptions = buildTakenFilterOptions(takers);

  const modalHTML = `
    <div id="filterModal" class="filter-modal">
      <div class="filter-modal-overlay" onclick="closeFilterModal()"></div>
      <div class="filter-modal-content">
        <div class="filter-modal-header">
          <h2>Filter Settings</h2>
          <button class="filter-modal-close" onclick="closeFilterModal()" title="Close">&times;</button>
        </div>

        <div class="filter-modal-body">
          <div class="filter-modal-group">
            <label for="filterModal_pendingFilter">Pending Status</label>
            <select id="filterModal_pendingFilter">
              <option value="all">All items (ignore pending)</option>
              <option value="pending">Pending only</option>
              <option value="not-pending">Not pending only</option>
            </select>
            <div class="filter-modal-help">Pending = not completed and all dependencies met</div>
          </div>

          <div class="filter-modal-group">
            <label for="filterModal_monitorFilter">Monitor Status</label>
            <select id="filterModal_monitorFilter">
              <option value="all">All items (ignore monitor)</option>
              <option value="monitored">Monitored only</option>
              <option value="not-monitored">Not monitored only</option>
            </select>
            <div class="filter-modal-help">Filter by items you are monitoring</div>
          </div>

          <div class="filter-modal-group">
            <label for="filterModal_ignoredFilter">Visibility</label>
            <select id="filterModal_ignoredFilter">
              <option value="not-ignored">Not ignored (default)</option>
              <option value="all">All items (ignore visibility)</option>
              <option value="ignored">Ignored only</option>
            </select>
            <div class="filter-modal-help">Filter by ignored status</div>
          </div>

          <div class="filter-modal-group">
            <label for="filterModal_takenFilter">Taken By</label>
            <select id="filterModal_takenFilter">
              ${takenFilterOptions}
            </select>
            <div class="filter-modal-help">Filter by who has taken responsibility</div>
          </div>
        </div>

        <div class="filter-modal-footer">
          <button class="btn-secondary" onclick="closeFilterModal()">Cancel</button>
          <button class="btn-primary" onclick="applyFilters()">Apply Filters</button>
        </div>
      </div>
    </div>
  `;

  // Inject CSS
  const styleId = 'filterModalStyles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .filter-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s;
      }

      .filter-modal.show {
        opacity: 1;
      }

      .filter-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
      }

      .filter-modal-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .filter-modal-header {
        padding: 20px;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .filter-modal-header h2 {
        margin: 0;
        font-size: 20px;
        color: var(--text-primary);
      }

      .filter-modal-close {
        background: none;
        border: none;
        font-size: 28px;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      }

      .filter-modal-close:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }

      .filter-modal-body {
        padding: 20px;
        max-height: 60vh;
        overflow-y: auto;
      }

      .filter-modal-group {
        margin-bottom: 20px;
      }

      .filter-modal-group:last-child {
        margin-bottom: 0;
      }

      .filter-modal-group label {
        display: block;
        font-weight: 600;
        font-size: 14px;
        color: var(--text-primary);
        margin-bottom: 8px;
      }

      .filter-modal-group select {
        width: 100%;
        padding: 10px 12px;
        font-size: 14px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--input-bg);
        color: var(--text-primary);
        cursor: pointer;
      }

      .filter-modal-group select:focus {
        outline: none;
        border-color: var(--border-color-focus);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      .filter-modal-help {
        margin-top: 6px;
        font-size: 12px;
        color: var(--text-secondary);
      }

      .filter-modal-footer {
        padding: 20px;
        border-top: 1px solid var(--border-color);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
    `;
    document.head.appendChild(style);
  }

  // Add modal to DOM
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Set current filter values
  if (filterModalInstance && filterModalInstance.currentFilters) {
    const filters = filterModalInstance.currentFilters;
    document.getElementById('filterModal_pendingFilter').value = filters.pending || 'all';
    document.getElementById('filterModal_monitorFilter').value = filters.monitor || 'all';
    document.getElementById('filterModal_ignoredFilter').value = filters.ignored || 'not-ignored';
    document.getElementById('filterModal_takenFilter').value = filters.taken || 'all';
  }

  // ESC key handler
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeFilterModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}
