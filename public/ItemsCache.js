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

import { subscribeToEvent, apiCall, showRebuildProgress } from './sparkle-common.js';

export class ItemsCache {
  constructor() {
    // Cache state
    this.allItems = []; // Array of item summaries (from /api/allItems)
    this.allItemsWithDetails = new Map(); // Map of itemId -> full details
    this.pendingItemIds = new Set(); // Set of pending item IDs
    this.currentUserEmail = null; // Git user email (for monitor filtering)
    this.rebuilding = false; // Daemon reported an aggregate rebuild in progress

    // Observer pattern
    this.changeSubscribers = new Set();

    // Track initialization state
    this.initialized = false;

    // Track SSE unsubscribe functions
    this.unsubscribeAggregatesUpdated = null;
    this.unsubscribeRebuildCompleted = null;
    this.unsubscribeDataUpdated = null;
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

    // Subscribe to SSE events BEFORE the first load, not after.
    //
    // This ordering is the whole fix for "the browser comes up empty". The daemon used to
    // answer 503 while rebuilding aggregates; loadAllItems() threw, the exception escaped
    // initialize(), and these listeners were never registered — so the page had no way to
    // ever recover and sat blank until a manual reload. Registering first means that even
    // if the initial load fails, rebuildCompleted/dataUpdated will still repopulate us.
    this.setupSSEListeners();

    // A failed first load must not abort initialization. Mark ourselves initialized either
    // way so subscribers attach and later events are honoured.
    try {
      await this.loadAllItems();
    } catch (error) {
      console.error('ItemsCache: Initial load failed, will recover on next event:', error);
    }

    this.initialized = true;
    console.log('ItemsCache: Initialized successfully', {
      itemCount: this.allItems.length,
      pendingCount: this.pendingItemIds.size,
      rebuilding: this.rebuilding
    });

    // Notify subscribers after initialization
    this.notifySubscribers();
  }

  /**
   * Whether the daemon reported it is mid-rebuild. Views use this to show a read-only
   * banner rather than presenting a partial list as if it were complete.
   * @returns {boolean}
   */
  isRebuilding() {
    return this.rebuilding;
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

      // The daemon serves whatever aggregates exist while it rebuilds, flagging the
      // response rather than refusing it. Remember the flag so views can tell the list is
      // provisional; rebuildCompleted will trigger a reload with the full set.
      this.rebuilding = allItemsResult.rebuilding === true;

      // Surface the existing rebuild overlay. It is normally opened by the rebuildStarted
      // SSE event, but a page that LOADS mid-rebuild never saw that event — which is
      // exactly the case this flag exists for. Without this the user would be shown a
      // partial list with nothing indicating it was still filling in.
      if (this.rebuilding) {
        const progress = allItemsResult.progress || { current: 0, total: 0 };
        showRebuildProgress(progress.current, progress.total, 'initialization');
      }

      console.log(`ItemsCache: Loaded ${this.allItems.length} items, ${this.pendingItemIds.size} pending (${Date.now() - loadStart}ms)${this.rebuilding ? ' [rebuild in progress]' : ''}`);

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

    // Subscribe to the generic data-changed event as a safety net.
    //
    // aggregatesUpdated is precise but conditional: the daemon only emits it when it can
    // work out exactly which items changed. dataUpdated is emitted unconditionally on
    // every fetch that brought new commits. Without this listener, any fetch that could
    // not compute a changed-file set left this cache stale while the audit trail and
    // status file views (which do listen to dataUpdated) carried on updating — the daemon
    // looked healthy and only the item list silently froze.
    this.unsubscribeDataUpdated = subscribeToEvent('dataUpdated', async () => {
      await this.handleDataUpdated();
    });

    console.log('ItemsCache: SSE listeners registered');
  }

  /**
   * Handle the generic dataUpdated event by reloading the full item set.
   * @private
   */
  async handleDataUpdated() {
    console.log('ItemsCache: dataUpdated event, reloading all items');

    try {
      await this.loadAllItems();
      this.notifySubscribers();
    } catch (error) {
      console.error('ItemsCache: Failed to handle dataUpdated:', error);
    }
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

    // The rebuild is over regardless of whether the reload below succeeds, so clear the
    // flag first — otherwise a failed reload would leave views stuck showing the banner.
    this.rebuilding = false;

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
    if (this.unsubscribeDataUpdated) {
      this.unsubscribeDataUpdated();
    }
    this.changeSubscribers.clear();
    console.log('ItemsCache: Destroyed');
  }
}
