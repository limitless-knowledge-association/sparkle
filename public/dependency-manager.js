/**
 * Sparkle Dependency Manager
 * Reusable modal component for managing item dependencies
 */

import { openItemCreator } from './item-creator.js';
import { openItemEditor } from './item-editor.js';
import { subscribeToEvent } from './sparkle-common.js';
import { modalStack } from './modal-stack.js';

/**
 * Dependency Manager Modal Class
 * Each instance represents one dependency management modal
 */
class DependencyManagerModal {
  constructor(itemId, mode, onSave) {
    this.id = `dependencyManagerModal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.itemId = itemId;
    this.mode = mode; // 'dependencies' or 'dependents'
    this.onSaveCallback = onSave;
    this.dependencyData = null;
    this.currentCheckboxStates = new Map(); // Current state
    this.savedCheckboxStates = new Map(); // Last saved state (snapshot)
    this.state = 'clean'; // State machine: 'clean' or 'dirty'
    this.element = null;
    this.bodyElement = null;
    this.titleElement = null;
    this.overlayElement = null;
    this.linkingOverlayElement = null;
    this.unsubscribeDataUpdate = null;
    this.unsubscribeServerDisconnected = null;
    this.waitingForItemId = null;

    this.createDOM();
    this.setupEventHandlers();
    this.loadDependencies();
  }

  /**
   * Create and inject the modal DOM elements
   */
  createDOM() {
    // Inject styles once (static, shared across all instances)
    injectDependencyManagerStyles();

    const modalHTML = `
      <div id="${this.id}" class="sparkle-modal">
        <div class="sparkle-modal-overlay"></div>
        <div class="sparkle-modal-content size-medium">
          <div class="sparkle-modal-header">
            <h3 class="dep-manager-title">Manage Dependencies</h3>
            <button class="sparkle-modal-close">&times;</button>
          </div>
          <div class="sparkle-modal-body">
            <div class="loading-state">Loading...</div>
          </div>
          <div class="sparkle-modal-footer">
            <button class="btn-success dep-btn-create">Create Item</button>
            <div style="flex: 1;"></div>
            <button class="btn-secondary dep-btn-cancel" disabled>Cancel</button>
            <button class="btn-primary dep-btn-save" disabled>Save Changes</button>
          </div>
          <div class="dep-linking-overlay" style="display: none;">
            <div class="dep-linking-message">Linking...</div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Store references to key elements
    this.element = document.getElementById(this.id);
    this.titleElement = this.element.querySelector('.dep-manager-title');
    this.bodyElement = this.element.querySelector('.sparkle-modal-body');
    this.overlayElement = this.element.querySelector('.sparkle-modal-overlay');
    this.linkingOverlayElement = this.element.querySelector('.dep-linking-overlay');

    // Set title based on mode
    if (this.mode === 'dependencies') {
      this.titleElement.textContent = 'Manage What This Item Needs';
    } else {
      this.titleElement.textContent = 'Manage What This Item Supports';
    }
  }

  /**
   * Setup event handlers for this instance
   */
  setupEventHandlers() {
    // Close button
    const closeBtn = this.element.querySelector('.dep-manager-close');
    closeBtn.addEventListener('click', () => this.close());

    // Cancel button (same behavior as ESC key)
    const cancelBtn = this.element.querySelector('.dep-btn-cancel');
    cancelBtn.addEventListener('click', () => this.handleEscape());

    // Save button
    const saveBtn = this.element.querySelector('.dep-btn-save');
    saveBtn.addEventListener('click', () => this.saveDependencies());

    // Create Item button
    const createBtn = this.element.querySelector('.dep-btn-create');
    createBtn.addEventListener('click', () => this.openCreateItem());

    // Overlay click - beep instead of close (modal stack handles this)
    this.overlayElement.addEventListener('click', () => {
      modalStack.beep();
    });

    // Subscribe to SSE aggregatesUpdated events
    this.unsubscribeDataUpdate = subscribeToEvent('aggregatesUpdated', async (e) => {
      // Only reload if modal is currently open and not destroyed
      if (this.element && this.bodyElement && this.element.classList.contains('show') && this.itemId) {
        const data = JSON.parse(e.data);
        if (data.itemIds.includes(this.itemId)) {
          console.log('Dependency manager: Current item updated, reloading dependency list for item:', this.itemId);
          await this.reloadDependencyData();
        }
      }
    });

    // Subscribe to server disconnection - close modal to show disconnection notice
    this.unsubscribeServerDisconnected = subscribeToEvent('serverDisconnected', () => {
      console.log('Dependency manager: Server disconnected, closing modal');
      this.close();
    });
  }

  /**
   * Show the modal
   */
  show() {
    this.element.classList.add('show');
    // Register with modal stack
    modalStack.push(this);
  }

  /**
   * Close the modal
   */
  close() {
    // Remove from modal stack (which will call destroy())
    modalStack.remove(this);
  }

  /**
   * Clean up and destroy this modal instance
   */
  destroy() {
    // Unsubscribe from SSE events
    if (this.unsubscribeDataUpdate) {
      this.unsubscribeDataUpdate();
      this.unsubscribeDataUpdate = null;
    }

    // Unsubscribe from server disconnection events
    if (this.unsubscribeServerDisconnected) {
      this.unsubscribeServerDisconnected();
      this.unsubscribeServerDisconnected = null;
    }

    // Remove DOM element
    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    // Clear references
    this.bodyElement = null;
    this.titleElement = null;
    this.overlayElement = null;
    this.linkingOverlayElement = null;
    this.dependencyData = null;
    this.currentCheckboxStates.clear();
    this.savedCheckboxStates.clear();
    this.onSaveCallback = null;
  }

  // Modal stack integration methods
  setZIndex(z) {
    if (this.overlayElement) {
      this.overlayElement.style.zIndex = z;
    }
    if (this.element) {
      const contentElement = this.element.querySelector('.sparkle-modal-content');
      if (contentElement) {
        contentElement.style.zIndex = z + 1;
      }
    }
  }

  setOverlayVisible(visible) {
    if (this.overlayElement) {
      this.overlayElement.style.opacity = visible ? '1' : '0';
    }
  }

  /**
   * Handle ESC key based on current state
   */
  handleEscape() {
    if (this.state === 'dirty') {
      // Dirty state: Cancel changes and return to clean
      this.cancelChanges();
    } else {
      // Clean state: Close the modal
      this.close();
    }
  }

  /**
   * Cancel changes and restore to last saved state
   */
  cancelChanges() {
    if (!this.dependencyData) return;

    // Restore all checkboxes to saved state
    for (const item of [...this.dependencyData.current, ...this.dependencyData.candidates]) {
      const checkbox = this.element.querySelector(`#dep-${item.itemId}`);
      if (checkbox) {
        const savedState = this.savedCheckboxStates.get(item.itemId);
        if (savedState !== undefined) {
          checkbox.checked = savedState;
          this.currentCheckboxStates.set(item.itemId, savedState);
        }
      }
    }

    // Transition to clean state
    this.transitionToState('clean');
  }

  /**
   * Take a snapshot of current checkbox states
   */
  takeSnapshot() {
    this.currentCheckboxStates.clear();
    this.savedCheckboxStates.clear();

    if (!this.dependencyData) return;

    for (const item of [...this.dependencyData.current, ...this.dependencyData.candidates]) {
      const checkbox = this.element.querySelector(`#dep-${item.itemId}`);
      if (checkbox) {
        const state = checkbox.checked;
        this.currentCheckboxStates.set(item.itemId, state);
        this.savedCheckboxStates.set(item.itemId, state);
      }
    }
  }

  /**
   * Handle checkbox state change
   */
  onCheckboxChange(itemId, newState) {
    this.currentCheckboxStates.set(itemId, newState);
    this.evaluateState();
  }

  /**
   * Evaluate if state should be clean or dirty
   */
  evaluateState() {
    // Compare current state with saved state
    let hasChanges = false;

    for (const [itemId, savedState] of this.savedCheckboxStates) {
      const currentState = this.currentCheckboxStates.get(itemId);
      if (currentState !== savedState) {
        hasChanges = true;
        break;
      }
    }

    const newState = hasChanges ? 'dirty' : 'clean';
    if (newState !== this.state) {
      this.transitionToState(newState);
    }
  }

  /**
   * Transition to a new state and update UI accordingly
   */
  transitionToState(newState) {
    console.log(`Dependency manager: State transition from '${this.state}' to '${newState}'`);
    this.state = newState;
    this.updateButtonStates();
  }

  /**
   * Load dependencies from server
   */
  async loadDependencies() {
    try {
      const endpoint = this.mode === 'dependencies' ? '/api/getPotentialDependencies' : '/api/getPotentialDependents';
      this.dependencyData = await apiCall(endpoint, { itemId: this.itemId });
      this.renderDependencySelection();
    } catch (error) {
      this.bodyElement.innerHTML = `<div style="text-align: center; padding: 40px; color: #ef4444;">Error: ${error.message}</div>`;
    }
  }

  /**
   * Reload dependency data from server
   */
  async reloadDependencyData() {
    if (!this.itemId || !this.mode || !this.bodyElement) return;

    try {
      const endpoint = this.mode === 'dependencies' ? '/api/getPotentialDependencies' : '/api/getPotentialDependents';
      this.dependencyData = await apiCall(endpoint, { itemId: this.itemId });
      this.renderDependencySelection();

      // Check if we were waiting for a specific item to appear
      if (this.waitingForItemId) {
        const itemFound = this.dependencyData.current.some(item => item.itemId === this.waitingForItemId);
        if (itemFound) {
          console.log('Dependency manager: New item appeared in list, clearing overlay');
          this.hideLinkingOverlay();
        }
      }
    } catch (error) {
      console.error('Failed to reload dependency data:', error);
    }
  }

  /**
   * Render the dependency selection UI
   */
  renderDependencySelection() {
    // Guard against rendering after modal is destroyed
    if (!this.bodyElement || !this.dependencyData) return;

    // Initialize state maps with initial values
    this.currentCheckboxStates.clear();
    this.savedCheckboxStates.clear();
    for (const item of this.dependencyData.current) {
      this.currentCheckboxStates.set(item.itemId, true);
      this.savedCheckboxStates.set(item.itemId, true);
    }
    for (const item of this.dependencyData.candidates) {
      this.currentCheckboxStates.set(item.itemId, false);
      this.savedCheckboxStates.set(item.itemId, false);
    }

    let html = '';

    // Help text
    if (this.mode === 'dependencies') {
      html += '<div class="dep-help-text">';
      html += 'Select items that this item depends on. Items that would create a cycle are not shown.';
      html += '</div>';
    } else {
      html += '<div class="dep-help-text">';
      html += 'Select items that should depend on this item. Items that would create a cycle are not shown.';
      html += '</div>';
    }

    // Search box
    html += '<div class="dep-search-container">';
    html += '<input type="text" class="dep-search-box" placeholder="Search items..." />';
    html += '</div>';

    // Current dependencies/dependents
    if (this.dependencyData.current.length > 0) {
      html += '<div class="dep-section">';
      html += '<h4>Currently Selected</h4>';
      html += '<ul class="dep-list dep-list-current">';

      for (const item of this.dependencyData.current) {
        const tagline = item.tagline || '(no tagline)';
        const searchTagline = tagline.toLowerCase();
        html += `<li class="dep-item" data-tagline="${escapeHtml(searchTagline)}" data-itemid="${item.itemId.toLowerCase()}">`;
        html += `<input type="checkbox" id="dep-${item.itemId}" checked class="dep-checkbox" data-itemid="${item.itemId}">`;
        html += '<div class="dep-item-content">';
        html += `<div class="dep-item-tagline">${escapeHtml(tagline)}</div>`;
        html += `<div class="dep-item-id">${item.itemId}</div>`;
        html += '</div>';
        html += '</li>';
      }

      html += '</ul>';
      html += '</div>';
    }

    // Available candidates
    if (this.dependencyData.candidates.length > 0) {
      html += '<div class="dep-section">';
      html += '<h4>Available Items</h4>';
      html += '<ul class="dep-list dep-list-candidates">';

      for (const item of this.dependencyData.candidates) {
        const tagline = item.tagline || '(no tagline)';
        const searchTagline = tagline.toLowerCase();
        html += `<li class="dep-item" data-tagline="${escapeHtml(searchTagline)}" data-itemid="${item.itemId.toLowerCase()}">`;
        html += `<input type="checkbox" id="dep-${item.itemId}" class="dep-checkbox" data-itemid="${item.itemId}">`;
        html += '<div class="dep-item-content">';
        html += `<div class="dep-item-tagline">${escapeHtml(tagline)}</div>`;
        html += `<div class="dep-item-id">${item.itemId}</div>`;
        html += '</div>';
        html += '</li>';
      }

      html += '</ul>';
      html += '</div>';
    }

    if (this.dependencyData.current.length === 0 && this.dependencyData.candidates.length === 0) {
      html += '<div style="text-align: center; padding: 20px; color: #666;">No items available</div>';
    }

    this.bodyElement.innerHTML = html;

    // Setup event listeners for checkboxes and list items
    this.setupDependencyListHandlers();
  }

  /**
   * Setup event handlers for dependency list items
   */
  setupDependencyListHandlers() {
    // Search box
    const searchBox = this.element.querySelector('.dep-search-box');
    if (searchBox) {
      searchBox.addEventListener('input', () => this.filterDependencyList());
    }

    // Checkboxes and list items
    const items = this.element.querySelectorAll('.dep-item');
    items.forEach(item => {
      const checkbox = item.querySelector('.dep-checkbox');
      const itemId = checkbox.getAttribute('data-itemid');

      // Click on item toggles checkbox
      item.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          this.onCheckboxChange(itemId, checkbox.checked);
        }
      });

      // Checkbox change notifies state machine
      checkbox.addEventListener('change', () => {
        this.onCheckboxChange(itemId, checkbox.checked);
      });

      // Prevent double-toggle when clicking checkbox directly
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    // Initial state is clean, update buttons
    this.transitionToState('clean');
  }

  /**
   * Update Save and Cancel button states based on current state
   */
  updateButtonStates() {
    const saveBtn = this.element.querySelector('.dep-btn-save');
    const cancelBtn = this.element.querySelector('.dep-btn-cancel');
    const isDirty = (this.state === 'dirty');

    if (saveBtn) {
      saveBtn.disabled = !isDirty;
    }
    if (cancelBtn) {
      cancelBtn.disabled = !isDirty;
    }
  }

  /**
   * Filter dependency list based on search
   */
  filterDependencyList() {
    const searchBox = this.element.querySelector('.dep-search-box');
    if (!searchBox) return;

    const searchText = searchBox.value.toLowerCase().trim();
    const items = this.element.querySelectorAll('.dep-item');

    for (const item of items) {
      const tagline = item.getAttribute('data-tagline') || '';
      const itemId = item.getAttribute('data-itemid') || '';

      const matches = searchText === '' ||
                     tagline.includes(searchText) ||
                     itemId.includes(searchText);

      item.style.display = matches ? 'flex' : 'none';
    }
  }

  /**
   * Show linking overlay
   */
  showLinkingOverlay() {
    if (this.linkingOverlayElement) {
      this.linkingOverlayElement.style.display = 'flex';
    }
  }

  /**
   * Hide linking overlay
   */
  hideLinkingOverlay() {
    if (this.linkingOverlayElement) {
      this.linkingOverlayElement.style.display = 'none';
    }
    this.waitingForItemId = null;
  }

  /**
   * Open item creator and link the created item
   */
  async openCreateItem() {
    openItemCreator(async (newItemId) => {
      try {
        // Show "Linking..." overlay while we add the dependency
        this.showLinkingOverlay();

        // Automatically add the newly created item as a dependency
        if (this.mode === 'dependencies') {
          // This item needs the newly created item
          await apiCall('/api/addDependency', {
            itemNeeding: this.itemId,
            itemNeeded: newItemId
          });
        } else {
          // The newly created item needs this item
          await apiCall('/api/addDependency', {
            itemNeeding: newItemId,
            itemNeeded: this.itemId
          });
        }

        showToast('Item created and linked');

        // Hide the linking overlay
        this.hideLinkingOverlay();

        // Open the item editor for the newly created item (stacks on top)
        // User can fill in details, then ESC back to this dependency manager
        openItemEditor(newItemId);

      } catch (error) {
        showToast(`Error adding dependency: ${error.message}`, 'error');
        this.hideLinkingOverlay();
      }
    });
  }

  /**
   * Save dependencies
   */
  async saveDependencies() {
    if (!this.itemId || !this.dependencyData) return;

    try {
      // Collect all checked item IDs
      const selectedIds = new Set();

      for (const item of [...this.dependencyData.current, ...this.dependencyData.candidates]) {
        const checkbox = this.element.querySelector(`#dep-${item.itemId}`);
        if (checkbox && checkbox.checked) {
          selectedIds.add(item.itemId);
        }
      }

      // Determine what needs to be added and removed
      const currentIds = new Set(this.dependencyData.current.map(item => item.itemId));

      const toAdd = [...selectedIds].filter(id => !currentIds.has(id));
      const toRemove = [...currentIds].filter(id => !selectedIds.has(id));

      // Make API calls
      if (this.mode === 'dependencies') {
        for (const itemNeeded of toAdd) {
          await apiCall('/api/addDependency', { itemNeeding: this.itemId, itemNeeded });
        }
        for (const itemNeeded of toRemove) {
          await apiCall('/api/removeDependency', { itemNeeding: this.itemId, itemNeeded });
        }
      } else {
        for (const itemNeeding of toAdd) {
          await apiCall('/api/addDependency', { itemNeeding, itemNeeded: this.itemId });
        }
        for (const itemNeeding of toRemove) {
          await apiCall('/api/removeDependency', { itemNeeding, itemNeeded: this.itemId });
        }
      }

      showToast('Dependencies updated');
      this.close();

      // Call the callback if provided
      if (this.onSaveCallback) {
        this.onSaveCallback();
      }
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
    }
  }
}

/**
 * Initialize and open a new dependency manager modal
 * @param {string} itemId - The item ID
 * @param {string} mode - 'dependencies' or 'dependents'
 * @param {Function} onSave - Callback when dependencies are saved
 * @returns {DependencyManagerModal} The modal instance
 */
export async function openDependencyManager(itemId, mode, onSave = null) {
  const instance = new DependencyManagerModal(itemId, mode, onSave);
  instance.show();
  return instance;
}

/**
 * Legacy initialization function (no longer needed, but kept for compatibility)
 */
export function initializeDependencyManager() {
  // No-op: initialization is now handled per-instance
}

/**
 * Legacy close function (kept for backwards compatibility with window.closeDependencyManager)
 * In Stage 1, we don't have a way to track the current instance globally,
 * so this is a no-op. ESC key and close buttons use instance methods.
 */
export function closeDependencyManager() {
  // No-op: instances handle their own closing
  // This function is kept for compatibility but shouldn't be called
  console.warn('closeDependencyManager() called - use instance.close() instead');
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  if (window.showToast) {
    window.showToast(message, type);
  }
}

/**
 * API call helper
 */
async function apiCall(endpoint, body = null) {
  const options = {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {}
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(endpoint, options);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Request failed');
  }

  return result;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Inject CSS styles (once)
 */
/**
 * Inject minimal dependency-manager-specific CSS styles (once)
 * Most styles come from sparkle-base.css
 */
function injectDependencyManagerStyles() {
  if (document.getElementById('dependencyManagerStyles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'dependencyManagerStyles';
  style.textContent = `
    /* Dependency Manager Specific Styles */

    /* Help text info box */
    .dep-help-text {
      padding: 12px;
      background: var(--info-bg, #f0f0ff);
      border-radius: 6px;
      color: var(--primary-color, #667eea);
      font-size: 14px;
      margin-bottom: 20px;
    }

    /* Search container */
    .dep-search-container {
      margin-bottom: 20px;
    }

    .dep-search-box {
      width: 100%;
    }

    /* Section styling */
    .dep-section {
      margin-bottom: 25px;
    }

    .dep-section h4 {
      margin: 0 0 12px 0;
      color: var(--primary-color, #667eea);
      font-size: 16px;
    }

    /* Dependency list item styling */
    .dep-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .dep-item {
      display: flex;
      align-items: center;
      padding: 12px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .dep-item:hover {
      background: var(--bg-hover);
    }

    .dep-item input[type="checkbox"] {
      margin-right: 12px;
      cursor: pointer;
    }

    .dep-item-content {
      flex: 1;
    }

    .dep-item-tagline {
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .dep-item-id {
      font-size: 12px;
      color: var(--text-tertiary);
      font-family: monospace;
    }

    /* Linking overlay */
    .dep-linking-overlay {
      display: none;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(3px);
      z-index: 100;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
    }

    body.dark-mode .dep-linking-overlay {
      background: rgba(30, 30, 30, 0.9);
    }

    .dep-linking-message {
      font-size: 20px;
      font-weight: 600;
      color: var(--primary-color, #667eea);
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;

  document.head.appendChild(style);
}
