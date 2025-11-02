/**
 * Sparkle Item Creator
 * Reusable modal component for creating new items
 */

import { frontendLog, subscribeToEvent } from './sparkle-common.js';
import { modalStack } from './modal-stack.js';

/**
 * Item Creator Modal Class
 * Each instance represents one item creation modal
 */
class ItemCreatorModal {
  constructor(onCreate) {
    this.id = `itemCreatorModal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.onCreateCallback = onCreate;
    this.element = null;
    this.formElement = null;
    this.overlayElement = null;
    this.unsubscribeServerDisconnected = null;

    this.createDOM();
    this.setupEventHandlers();
  }

  /**
   * Create and inject the modal DOM elements
   */
  createDOM() {
    // Inject styles once (static, shared across all instances)
    injectItemCreatorStyles();

    const modalHTML = `
      <div id="${this.id}" class="sparkle-modal">
        <div class="sparkle-modal-overlay"></div>
        <div class="sparkle-modal-content size-small">
          <div class="sparkle-modal-header">
            <h3>Create New Item</h3>
            <button class="sparkle-modal-close">&times;</button>
          </div>
          <form class="item-creator-form">
            <div class="sparkle-modal-body">
              <div class="form-group">
                <label for="itemCreatorTagline">Tagline</label>
                <input type="text" class="item-creator-tagline" required />
              </div>
            </div>
            <div class="sparkle-modal-footer">
              <button type="button" class="btn-secondary item-creator-cancel">Cancel</button>
              <button type="submit" class="btn-primary">Create</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Store references to key elements
    this.element = document.getElementById(this.id);
    this.formElement = this.element.querySelector('.item-creator-form');
    this.overlayElement = this.element.querySelector('.sparkle-modal-overlay');
  }

  /**
   * Setup event handlers for this instance
   */
  setupEventHandlers() {
    // Form submission
    this.formElement.addEventListener('submit', (e) => this.handleSubmit(e));

    // Close button
    const closeBtn = this.element.querySelector('.sparkle-modal-close');
    closeBtn.addEventListener('click', () => this.close());

    // Cancel button
    const cancelBtn = this.element.querySelector('.item-creator-cancel');
    cancelBtn.addEventListener('click', () => this.close());

    // Overlay click - beep instead of close (modal stack handles this)
    this.overlayElement.addEventListener('click', () => {
      modalStack.beep();
    });

    // Subscribe to server disconnection - close modal to show disconnection notice
    this.unsubscribeServerDisconnected = subscribeToEvent('serverDisconnected', () => {
      console.log('Item creator: Server disconnected, closing modal');
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

    // Focus on the tagline input
    setTimeout(() => {
      const taglineInput = this.element.querySelector('.item-creator-tagline');
      taglineInput?.focus();
    }, 100);
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
    this.formElement = null;
    this.overlayElement = null;
    this.onCreateCallback = null;
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

  // Item creator doesn't have dirty state, so ESC always closes
  handleEscape() {
    this.close();
  }

  /**
   * Handle form submission
   */
  async handleSubmit(e) {
    e.preventDefault();

    const taglineInput = this.element.querySelector('.item-creator-tagline');
    const tagline = taglineInput.value;

    try {
      // Create with default status 'incomplete' and no initial entry
      const payload = { tagline, status: 'incomplete' };
      frontendLog(`item-creator: Creating item with tagline: ${tagline}`);
      const result = await apiCall('/api/createItem', payload);

      frontendLog(`item-creator: Item created with ID: ${result.itemId}`);
      showToast(`Item created: ${result.itemId}`);

      // Save callback before closing
      const callback = this.onCreateCallback;
      this.close();

      // Call the callback if provided, passing the new itemId
      frontendLog(`item-creator: Callback exists? ${!!callback}`);
      if (callback) {
        frontendLog(`item-creator: Calling callback with itemId: ${result.itemId}`);
        callback(result.itemId);
      } else {
        frontendLog('item-creator: No callback provided');
      }
    } catch (error) {
      frontendLog(`item-creator: Error creating item: ${error.message}`);
      showToast(`Error: ${error.message}`, 'error');
    }
  }
}

/**
 * Initialize and open a new item creator modal
 * @param {Function} onCreate - Callback when item is created, receives itemId as parameter
 * @returns {ItemCreatorModal} The modal instance
 */
export async function openItemCreator(onCreate = null) {
  frontendLog(`item-creator: openItemCreator called, callback provided? ${!!onCreate}`);

  const instance = new ItemCreatorModal(onCreate);
  instance.show();
  return instance;
}

/**
 * Legacy initialization function (no longer needed, but kept for compatibility)
 */
export function initializeItemCreator() {
  // No-op: initialization is now handled per-instance
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
 * Inject CSS styles (once)
 */
/**
 * Inject minimal item-creator-specific CSS styles (once)
 * Most styles come from sparkle-base.css
 */
function injectItemCreatorStyles() {
  if (document.getElementById('itemCreatorStyles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'itemCreatorStyles';
  style.textContent = `
    /* Item Creator Specific Styles */

    /* Tagline input full width */
    .item-creator-tagline {
      width: 100%;
    }
  `;

  document.head.appendChild(style);
}
