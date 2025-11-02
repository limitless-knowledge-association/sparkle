/**
 * MonitorView.js
 * View layer for rendering the Monitor display
 */

import { auditEntriesDiffer } from './AuditModel.js';

export class MonitorView {
  constructor(containerId, onItemClickCallback) {
    this.container = document.getElementById(containerId);
    this.onItemClick = onItemClickCallback;
    this.currentEntries = null; // null = not yet loaded, allows initial render of empty state
  }

  /**
   * Render audit entries
   * @param {AuditEntry[]} entries
   */
  render(entries) {
    // Check if data has actually changed to avoid unnecessary repaints
    // Skip check if this is first render (currentEntries is null)
    if (this.currentEntries !== null && !auditEntriesDiffer(entries, this.currentEntries)) {
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
  renderEmpty(message = 'No Items') {
    this.container.innerHTML = `
      <div class="empty-state">
        <p>${message}</p>
      </div>
    `;
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
    li.setAttribute('data-item-id', entry.itemId);

    // Add ignored class if item is ignored (for visual indication)
    if (entry.ignored === true) {
      li.classList.add('audit-item-ignored');
    }

    li.onclick = () => {
      if (this.onItemClick) {
        this.onItemClick(entry.itemId);
      }
    };

    const itemId = this.escapeHtml(entry.itemId);
    const tagline = this.escapeHtml(entry.tagline);
    const status = this.escapeHtml(entry.status);
    const ignoredIndicator = entry.ignored === true ? ' <span class="ignored-badge">ignored</span>' : '';

    // Convert ISO timestamp to locale string for display
    const localeTimestamp = new Date(entry.isoTimestamp).toLocaleString();
    const eventText = entry.formatEventText();
    const fullEventDisplay = `${localeTimestamp} - ${eventText}`;

    li.innerHTML = `
      <div class="audit-item-content">
        <div class="audit-item-icon"></div>
        <div class="audit-item-text">
          <div class="audit-item-header">
            <span class="audit-item-id">${itemId}</span>
            <span class="audit-item-status">[${status}]</span>
            <span class="audit-item-tagline">${tagline}</span>${ignoredIndicator}
          </div>
          <div class="audit-item-event">${this.escapeHtml(fullEventDisplay)}</div>
        </div>
      </div>
    `;

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
    this.container.innerHTML = '<div class="loading-state">Loading monitored items...</div>';
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
