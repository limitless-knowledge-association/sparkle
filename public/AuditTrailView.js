/**
 * AuditTrailView.js
 * View layer for rendering the Audit Trail display (single item)
 */

import { auditEntriesDiffer } from './AuditModel.js';

export class AuditTrailView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentEntries = [];
  }

  /**
   * Render audit entries
   * @param {AuditEntry[]} entries
   */
  render(entries) {
    // Check if data has actually changed to avoid unnecessary repaints
    if (!auditEntriesDiffer(entries, this.currentEntries)) {
      return; // No changes, skip render
    }

    this.currentEntries = entries;

    if (entries.length === 0) {
      this.renderEmpty();
      return;
    }

    this.renderEntries(entries);
  }

  /**
   * Render empty state
   */
  renderEmpty() {
    this.container.innerHTML = '<div class="empty-state">No audit trail events found</div>';
  }

  /**
   * Render audit entries by diffing and only inserting/removing changed elements
   */
  renderEntries(entries) {
    // Get or create the list container
    let listElement = this.container.querySelector('.audit-list');
    if (!listElement) {
      listElement = document.createElement('ul');
      listElement.className = 'audit-list';
      this.container.innerHTML = '';
      this.container.appendChild(listElement);
    }

    // Build a map of current DOM elements by their key
    const currentElements = new Map();
    const existingItems = listElement.querySelectorAll('.audit-item');
    existingItems.forEach(item => {
      const key = item.getAttribute('data-entry-key');
      if (key) {
        currentElements.set(key, item);
      }
    });

    // Build a set of new entry keys
    const newKeys = new Set();
    entries.forEach(entry => {
      newKeys.add(entry.getKey());
    });

    // Remove elements that are no longer in the new data
    currentElements.forEach((element, key) => {
      if (!newKeys.has(key)) {
        listElement.removeChild(element);
      }
    });

    // Rebuild the list in the correct order
    // This ensures entries appear in sorted order (newest first)
    entries.forEach((entry, index) => {
      const key = entry.getKey();
      let element = currentElements.get(key);

      if (!element) {
        // Element doesn't exist - create it
        element = this.createEntryElement(entry);
      }

      // Insert/move element to correct position
      const currentChild = listElement.children[index];
      if (currentChild !== element) {
        if (currentChild) {
          listElement.insertBefore(element, currentChild);
        } else {
          listElement.appendChild(element);
        }
      }
    });
  }

  /**
   * Create a DOM element for an audit entry
   */
  createEntryElement(entry) {
    const li = document.createElement('li');
    li.className = 'audit-item';
    li.setAttribute('data-entry-key', entry.getKey());

    // Convert ISO timestamp to locale string for display
    const localeTimestamp = new Date(entry.isoTimestamp).toLocaleString();
    const eventText = entry.formatEventText();
    const fullEventDisplay = `${localeTimestamp} - ${eventText}`;

    li.textContent = fullEventDisplay;
    return li;
  }

  /**
   * Render error state
   */
  renderError(message) {
    this.container.innerHTML = `<div class="error-state">Error: ${this.escapeHtml(message)}</div>`;
  }

  /**
   * Render loading state
   */
  renderLoading() {
    this.container.innerHTML = '<div class="loading-state">Loading audit trail...</div>';
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
