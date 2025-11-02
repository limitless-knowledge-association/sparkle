/**
 * GitStatus - Single source of truth for git status in the browser
 *
 * Responsibilities:
 * - Subscribe to gitStatus SSE events from daemon
 * - Maintain current git status and reason
 * - Provide simple active/needs-refresh states
 * - Notify UI observers when status changes
 * - Store detailed reasons for hover tooltips
 *
 * Architecture:
 * - Browser-only class (never instantiated in daemon)
 * - Single instance per browser tab (singleton pattern)
 * - UI subscribes via onChange() for status updates
 */

import { subscribeToEvent } from './sparkle-common.js';

export class GitStatus {
  constructor() {
    // Current status
    this.active = true; // Optimistic default
    this.reason = 'unknown';
    this.details = null;
    this.timestamp = null;

    // Observer pattern
    this.changeSubscribers = new Set();

    // Initialization state
    this.initialized = false;
    this.unsubscribeSSE = null;
  }

  /**
   * Initialize - subscribe to SSE events
   */
  initialize() {
    if (this.initialized) {
      console.warn('GitStatus already initialized');
      return;
    }

    // Subscribe to gitStatus SSE events
    this.unsubscribeSSE = subscribeToEvent('gitStatus', (e) => {
      this.handleStatusUpdate(e);
    });

    this.initialized = true;
    console.log('GitStatus: Initialized');
  }

  /**
   * Handle gitStatus SSE event
   * @private
   */
  handleStatusUpdate(e) {
    const data = JSON.parse(e.data);

    const statusChanged = this.active !== data.active ||
                         this.reason !== data.reason;

    this.active = data.active;
    this.reason = data.reason;
    this.details = data.details;
    this.timestamp = data.timestamp;

    console.log(`GitStatus: ${this.active ? 'active' : 'needs refresh'} (${this.reason})`);

    // Always notify subscribers (even if status didn't change, details might have)
    this.notifySubscribers();
  }

  /**
   * Subscribe to status changes
   * @param {Function} callback - Called with status object when status changes
   * @returns {Function} Unsubscribe function
   */
  onChange(callback) {
    this.changeSubscribers.add(callback);

    // Immediately invoke with current status if initialized
    if (this.initialized) {
      try {
        callback(this.getStatus());
      } catch (error) {
        console.error('GitStatus: Error in change subscriber (initial call):', error);
      }
    }

    // Return unsubscribe function
    return () => {
      this.changeSubscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of status change
   * @private
   */
  notifySubscribers() {
    const status = this.getStatus();
    console.log(`GitStatus: Notifying ${this.changeSubscribers.size} subscribers`);
    this.changeSubscribers.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('GitStatus: Error in change subscriber:', error);
      }
    });
  }

  /**
   * Get current status object
   * @returns {Object} Status object with all fields
   */
  getStatus() {
    return {
      active: this.active,
      reason: this.reason,
      details: this.details,
      timestamp: this.timestamp,
      displayText: this.active ? 'Git active' : 'Git needs refresh',
      tooltipText: this.getTooltipText()
    };
  }

  /**
   * Get tooltip text based on current status and reason
   * @returns {string} Human-readable tooltip text
   * @private
   */
  getTooltipText() {
    if (this.active) {
      switch (this.reason) {
        case 'push-success':
          return 'Git is connected. Last push succeeded.';
        case 'fetch-success':
          return 'Git is connected. Last fetch succeeded.';
        default:
          return 'Git is connected and synchronized with origin';
      }
    }

    // Git needs refresh - provide helpful error messages
    switch (this.reason) {
      case 'fetch-failed':
        return 'Cannot fetch from origin. Check network connection or SSH keys.\n' +
               (this.details ? `Details: ${this.details}` : '');
      case 'push-failed':
        return 'Cannot push to origin. Your changes are saved locally but not synchronized.\n' +
               (this.details ? `Details: ${this.details}` : '');
      case 'network-error':
        return 'Network connection issue. Changes are saved locally.';
      case 'auth-error':
        return 'Authentication failed. Check SSH keys or credentials.';
      case 'merge-conflict':
        return 'Merge conflict detected. Manual resolution required.';
      case 'push-timeout':
        return 'Push timed out. Network may be slow or unavailable.';
      default:
        return this.details ||
               'Git synchronization issue. Changes are saved locally but not pushed to origin.';
    }
  }

  /**
   * Get statistics about current status
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      active: this.active,
      reason: this.reason,
      timestamp: this.timestamp,
      subscribers: this.changeSubscribers.size
    };
  }

  /**
   * Cleanup - unsubscribe from SSE events
   */
  destroy() {
    if (this.unsubscribeSSE) {
      this.unsubscribeSSE();
    }
    this.changeSubscribers.clear();
    console.log('GitStatus: Destroyed');
  }
}
