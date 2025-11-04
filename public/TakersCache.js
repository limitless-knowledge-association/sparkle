/**
 * TakersCache - Single source of truth for all known takers in the browser
 *
 * Responsibilities:
 * - Maintain authoritative cache of all known takers
 * - Handle SSE events (takersUpdated)
 * - Notify subscribers when cache changes
 * - Provide read-only access to cached data
 *
 * Architecture:
 * - Browser-only class (never instantiated in daemon)
 * - Single instance per browser tab (singleton pattern)
 * - All UI views request data from this cache
 * - All UI views subscribe to onChange for updates
 */

import { subscribeToEvent, apiCall } from './sparkle-common.js';

export class TakersCache {
  constructor() {
    // Cache state
    this.takers = []; // Array of taker objects [{name, email, hash}]
    this.emailToNameMap = new Map(); // Map of email -> name for quick lookups

    // Observer pattern
    this.changeSubscribers = new Set();

    // Track initialization state
    this.initialized = false;

    // Track SSE unsubscribe function
    this.unsubscribeTakersUpdated = null;
  }

  /**
   * Initialize - load all takers and set up SSE listeners
   * Must be called before using this instance
   */
  async initialize() {
    if (this.initialized) {
      console.warn('TakersCache already initialized');
      return;
    }

    console.log('TakersCache: Initializing...');

    // Load initial data
    await this.loadTakers();

    // Subscribe to SSE events
    this.setupSSEListeners();

    this.initialized = true;
    console.log('TakersCache: Initialized successfully', {
      takerCount: this.takers.length
    });

    // Notify subscribers after initialization
    this.notifySubscribers();
  }

  /**
   * Load all takers from server
   * @private
   */
  async loadTakers() {
    const loadStart = Date.now();
    console.log('TakersCache: Loading takers...');

    try {
      const response = await apiCall('/api/getTakers');
      this.takers = response.takers || [];

      // Build email->name map
      this.emailToNameMap.clear();
      for (const taker of this.takers) {
        this.emailToNameMap.set(taker.email, taker.name);
      }

      console.log(`TakersCache: Loaded ${this.takers.length} takers (${Date.now() - loadStart}ms)`);
    } catch (error) {
      console.error('TakersCache: Failed to load takers:', error);
      // Don't throw - allow initialization to complete with empty cache
    }
  }

  /**
   * Set up SSE event listeners
   * @private
   */
  setupSSEListeners() {
    // Subscribe to takersUpdated events
    this.unsubscribeTakersUpdated = subscribeToEvent('takersUpdated', async (e) => {
      await this.handleTakersUpdated(e);
    });

    console.log('TakersCache: SSE listeners registered');
  }

  /**
   * Handle takersUpdated SSE event
   * Reload takers from server
   * @private
   */
  async handleTakersUpdated(e) {
    console.log('TakersCache: takersUpdated event received');

    try {
      await this.loadTakers();

      // Notify subscribers
      this.notifySubscribers();
    } catch (error) {
      console.error('TakersCache: Failed to handle takersUpdated:', error);
    }
  }

  /**
   * Subscribe to cache changes
   * @param {Function} callback - Called when cache changes
   * @returns {Function} Unsubscribe function
   */
  onChange(callback) {
    this.changeSubscribers.add(callback);

    // Immediately invoke callback with current state if initialized
    if (this.initialized) {
      try {
        callback();
      } catch (error) {
        console.error('TakersCache: Error in change subscriber (initial call):', error);
      }
    }

    // Return unsubscribe function
    return () => {
      this.changeSubscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of cache change
   * @private
   */
  notifySubscribers() {
    console.log(`TakersCache: Notifying ${this.changeSubscribers.size} subscribers`);
    this.changeSubscribers.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('TakersCache: Error in change subscriber:', error);
      }
    });
  }

  /**
   * Get all takers (returns a copy to prevent direct mutation)
   * @returns {Array} Array of taker objects
   */
  getTakers() {
    return [...this.takers];
  }

  /**
   * Get taker name by email
   * @param {string} email - Taker's email
   * @returns {string|null} Taker's name or null if not found
   */
  getTakerName(email) {
    return this.emailToNameMap.get(email) || null;
  }

  /**
   * Check if an email is a known taker
   * @param {string} email - Email to check
   * @returns {boolean} True if email is a known taker
   */
  isTaker(email) {
    return this.emailToNameMap.has(email);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      totalTakers: this.takers.length
    };
  }

  /**
   * Cleanup - unsubscribe from SSE events
   */
  destroy() {
    if (this.unsubscribeTakersUpdated) {
      this.unsubscribeTakersUpdated();
    }
    this.changeSubscribers.clear();
    console.log('TakersCache: Destroyed');
  }
}
