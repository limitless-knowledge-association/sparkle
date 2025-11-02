/**
 * ItemsCache - Single source of truth for all items in the browser
 *
 * Responsibilities:
 * - Maintain authoritative cache of all items and their details
 * - Handle SSE events (aggregatesUpdated, rebuildCompleted)
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

export class ItemsCache {
  constructor() {
    // Cache state
    this.allItems = []; // Array of item summaries (from /api/allItems)
    this.allItemsWithDetails = new Map(); // Map of itemId -> full details
    this.pendingItemIds = new Set(); // Set of pending item IDs
    this.currentUserEmail = null; // Git user email (for monitor filtering)

    // Observer pattern
    this.changeSubscribers = new Set();

    // Track initialization state
    this.initialized = false;

    // Track SSE unsubscribe functions
    this.unsubscribeAggregatesUpdated = null;
    this.unsubscribeRebuildCompleted = null;
  }

  /**
   * Initialize - load all items and set up SSE listeners
   * Must be called before using this instance
   */
  async initialize() {
    if (this.initialized) {
      console.warn('ItemsCache already initialized');
      return;
    }

    console.log('ItemsCache: Initializing...');

    // Load initial data
    await this.loadAllItems();

    // Subscribe to SSE events
    this.setupSSEListeners();

    this.initialized = true;
    console.log('ItemsCache: Initialized successfully', {
      itemCount: this.allItems.length,
      pendingCount: this.pendingItemIds.size
    });

    // Notify subscribers after initialization
    this.notifySubscribers();
  }

  /**
   * Load all items from server
   * @private
   */
  async loadAllItems() {
    const loadStart = Date.now();
    console.log('ItemsCache: Loading all items...');

    try {
      // Fetch both all items and pending items in parallel
      const [allItemsResult, pendingResult] = await Promise.all([
        apiCall('/api/allItems'),
        apiCall('/api/pendingWork')
      ]);

      this.allItems = allItemsResult.items;
      this.pendingItemIds = new Set(pendingResult.items);

      console.log(`ItemsCache: Loaded ${this.allItems.length} items, ${this.pendingItemIds.size} pending (${Date.now() - loadStart}ms)`);

      // Get current user email by checking one item
      // This is efficient - we only need to fetch one item to get the git user
      if (!this.currentUserEmail && this.allItems.length > 0) {
        try {
          const firstItemDetails = await apiCall('/api/getItemDetails', { itemId: this.allItems[0].itemId });
          if (firstItemDetails.creator && firstItemDetails.creator.email) {
            this.currentUserEmail = firstItemDetails.creator.email;
            console.log(`ItemsCache: Current user email: ${this.currentUserEmail}`);
          }
        } catch (err) {
          console.error('ItemsCache: Failed to get current user email:', err);
        }
      }
    } catch (error) {
      console.error('ItemsCache: Failed to load items:', error);
      throw error;
    }
  }

  /**
   * Refresh pending item IDs from server
   * @private
   */
  async refreshPendingItemIds() {
    try {
      const pendingResult = await apiCall('/api/pendingWork');
      this.pendingItemIds = new Set(pendingResult.items);
      console.log(`ItemsCache: Refreshed pending items (${this.pendingItemIds.size} pending)`);
    } catch (error) {
      console.error('ItemsCache: Failed to refresh pending items:', error);
    }
  }

  /**
   * Set up SSE event listeners
   * @private
   */
  setupSSEListeners() {
    // Subscribe to aggregatesUpdated events
    this.unsubscribeAggregatesUpdated = subscribeToEvent('aggregatesUpdated', async (e) => {
      await this.handleAggregatesUpdated(e);
    });

    // Subscribe to rebuildCompleted events
    this.unsubscribeRebuildCompleted = subscribeToEvent('rebuildCompleted', async (e) => {
      await this.handleRebuildCompleted(e);
    });

    console.log('ItemsCache: SSE listeners registered');
  }

  /**
   * Handle aggregatesUpdated SSE event
   * This is where we fix the bug - new items must be added to the cache
   * @private
   */
  async handleAggregatesUpdated(e) {
    const data = JSON.parse(e.data);
    const count = data.itemIds.length;
    console.log(`ItemsCache: aggregatesUpdated event (${count} item(s), reason: ${data.reason})`, data.itemIds);

    try {
      // Fetch fresh details for all updated items
      const updatePromises = data.itemIds.map(itemId =>
        apiCall('/api/getItemDetails', { itemId })
      );
      const updatedDetailsList = await Promise.all(updatePromises);

      let newItemsAdded = 0;
      let existingItemsUpdated = 0;

      // Update cache and allItems array for each item
      updatedDetailsList.forEach((updatedDetails, index) => {
        const itemId = data.itemIds[index];
        this.allItemsWithDetails.set(itemId, updatedDetails);

        const itemIndex = this.allItems.findIndex(item => item.itemId === itemId);
        if (itemIndex !== -1) {
          // Update existing item
          this.allItems[itemIndex] = updatedDetails;
          existingItemsUpdated++;
        } else {
          // NEW ITEM - add to array (THIS FIXES THE BUG!)
          this.allItems.push(updatedDetails);
          newItemsAdded++;
          console.log(`ItemsCache: Added new item ${itemId} to cache`);
        }
      });

      // Refresh pending status for all items (in case new items are pending)
      await this.refreshPendingItemIds();

      console.log(`ItemsCache: Updated cache - ${newItemsAdded} new, ${existingItemsUpdated} updated`);

      // Notify subscribers
      this.notifySubscribers();
    } catch (error) {
      console.error('ItemsCache: Failed to handle aggregatesUpdated:', error);
    }
  }

  /**
   * Handle rebuildCompleted SSE event
   * Reload all items from scratch
   * @private
   */
  async handleRebuildCompleted(e) {
    console.log('ItemsCache: rebuildCompleted event, reloading all items');

    try {
      await this.loadAllItems();

      // Notify subscribers
      this.notifySubscribers();
    } catch (error) {
      console.error('ItemsCache: Failed to handle rebuildCompleted:', error);
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
        console.error('ItemsCache: Error in change subscriber (initial call):', error);
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
    console.log(`ItemsCache: Notifying ${this.changeSubscribers.size} subscribers`);
    this.changeSubscribers.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('ItemsCache: Error in change subscriber:', error);
      }
    });
  }

  /**
   * Get all items (returns a copy to prevent direct mutation)
   * @returns {Array} Array of item objects
   */
  getItems() {
    return [...this.allItems];
  }

  /**
   * Get item details from cache (lazy-loaded)
   * @param {string} itemId - Item ID
   * @returns {Object|null} Item details or null if not cached
   */
  getItemDetails(itemId) {
    return this.allItemsWithDetails.get(itemId) || null;
  }

  /**
   * Ensure item details are loaded into cache
   * @param {string} itemId - Item ID
   * @returns {Promise<Object>} Item details
   */
  async ensureItemDetails(itemId) {
    if (!this.allItemsWithDetails.has(itemId)) {
      try {
        const details = await apiCall('/api/getItemDetails', { itemId });
        this.allItemsWithDetails.set(itemId, details);
        return details;
      } catch (err) {
        console.error(`ItemsCache: Failed to load details for ${itemId}:`, err);
        return null;
      }
    }
    return this.allItemsWithDetails.get(itemId);
  }

  /**
   * Get all item details Map (for batch operations)
   * @returns {Map} Map of itemId -> details
   */
  getAllItemDetails() {
    return this.allItemsWithDetails;
  }

  /**
   * Get pending item IDs (returns a copy)
   * @returns {Set} Set of pending item IDs
   */
  getPendingItemIds() {
    return new Set(this.pendingItemIds);
  }

  /**
   * Get current user email
   * @returns {string|null} Current user email
   */
  getCurrentUserEmail() {
    return this.currentUserEmail;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      totalItems: this.allItems.length,
      itemsWithDetails: this.allItemsWithDetails.size,
      pendingItems: this.pendingItemIds.size,
      currentUserEmail: this.currentUserEmail
    };
  }

  /**
   * Cleanup - unsubscribe from SSE events
   */
  destroy() {
    if (this.unsubscribeAggregatesUpdated) {
      this.unsubscribeAggregatesUpdated();
    }
    if (this.unsubscribeRebuildCompleted) {
      this.unsubscribeRebuildCompleted();
    }
    this.changeSubscribers.clear();
    console.log('ItemsCache: Destroyed');
  }
}
