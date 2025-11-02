/**
 * AuditController.js
 * Controller for fetching and managing audit trail data
 * Used by both Monitor view and Audit Trail view
 */

import { AuditEntry, sortAuditEntries } from './AuditModel.js';

export class AuditController {
  constructor(apiCallFn, subscribeToEventFn) {
    this.apiCall = apiCallFn;
    this.subscribeToEvent = subscribeToEventFn;
    this.currentEntries = [];
    this.onDataChangedCallback = null;
    this.isLoading = false;
  }

  /**
   * Set callback to be called when data changes
   */
  onDataChanged(callback) {
    this.onDataChangedCallback = callback;
  }

  /**
   * Subscribe to data updates via SSE
   */
  subscribeToUpdates() {
    this.subscribeToEvent('dataUpdated', () => {
      console.log('AuditController: Data updated, reloading');
      this.refresh();
    });
  }

  /**
   * Fetch audit trails for a single item
   * @param {string} itemId - The item ID to fetch audit trail for
   * @returns {Promise<AuditEntry[]>}
   */
  async fetchAuditTrailForItem(itemId) {
    const result = await this.apiCall('/api/getItemAuditTrail', { itemId });

    if (result.error) {
      throw new Error(result.error);
    }

    const entries = [];
    for (const eventData of result.events || []) {
      entries.push(new AuditEntry(itemId, eventData));
    }

    return entries;
  }

  /**
   * Fetch audit trails for multiple items (used by Monitor)
   * @param {Array<{itemId: string, tagline: string, status: string}>} items
   * @returns {Promise<AuditEntry[]>}
   */
  async fetchAuditTrailsForItems(items) {
    const auditPromises = items.map(item =>
      this.apiCall('/api/getItemAuditTrail', { itemId: item.itemId })
        .then(result => ({
          itemId: item.itemId,
          events: result.events || [],
          itemDetails: item
        }))
        .catch(err => {
          console.warn(`Failed to get audit trail for ${item.itemId}:`, err);
          return { itemId: item.itemId, events: [], itemDetails: item };
        })
    );

    const auditResults = await Promise.all(auditPromises);

    const entries = [];
    for (const { itemId, events, itemDetails } of auditResults) {
      for (const eventData of events) {
        entries.push(new AuditEntry(itemId, eventData, itemDetails));
      }
    }

    return entries;
  }

  /**
   * Fetch monitored items for current user
   * @returns {Promise<Array<{itemId: string, tagline: string, status: string}>>}
   */
  async fetchMonitoredItems() {
    // Get all items
    const allItemsResult = await this.apiCall('/api/allItems');
    const allItems = allItemsResult.items || [];

    if (allItems.length === 0) {
      return [];
    }

    // Get details for all items (including monitors)
    const itemDetailsPromises = allItems.map(item =>
      this.apiCall('/api/getItemDetails', { itemId: item.itemId })
        .catch(err => {
          console.warn(`Failed to get details for ${item.itemId}:`, err);
          return null;
        })
    );

    const allItemDetails = await Promise.all(itemDetailsPromises);

    // Get current user from first successful response
    let currentUser = null;
    const firstDetail = allItemDetails.find(d => d && d.currentUser);
    if (firstDetail) {
      currentUser = firstDetail.currentUser;
    }

    if (!currentUser) {
      throw new Error('Could not determine current user');
    }

    // Filter to only items the current user is monitoring
    const monitoredItems = allItemDetails
      .filter(details => {
        if (!details || !details.monitors) return false;
        return details.monitors.some(m =>
          m.name === currentUser.name && m.email === currentUser.email
        );
      })
      .map(details => ({
        itemId: details.itemId,
        tagline: details.tagline,
        status: details.status
      }));

    return monitoredItems;
  }

  /**
   * Load audit trail for a single item (Audit Trail view)
   * @param {string} itemId
   */
  async loadForItem(itemId) {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const entries = await this.fetchAuditTrailForItem(itemId);
      sortAuditEntries(entries);

      this.currentEntries = entries;

      if (this.onDataChangedCallback) {
        this.onDataChangedCallback(this.currentEntries);
      }
    } catch (error) {
      console.error('Error loading audit trail:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load audit trails for all monitored items (Monitor view)
   */
  async loadForMonitoredItems() {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const monitoredItems = await this.fetchMonitoredItems();

      if (monitoredItems.length === 0) {
        this.currentEntries = [];
        if (this.onDataChangedCallback) {
          this.onDataChangedCallback(this.currentEntries);
        }
        return;
      }

      const entries = await this.fetchAuditTrailsForItems(monitoredItems);
      sortAuditEntries(entries);

      this.currentEntries = entries;

      if (this.onDataChangedCallback) {
        this.onDataChangedCallback(this.currentEntries);
      }
    } catch (error) {
      console.error('Error loading monitored audits:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load audit trails for all items (Monitor view - show all)
   */
  async loadForAllItems() {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      // Get all items
      const allItemsResult = await this.apiCall('/api/allItems');
      const allItems = allItemsResult.items || [];

      if (allItems.length === 0) {
        this.currentEntries = [];
        if (this.onDataChangedCallback) {
          this.onDataChangedCallback(this.currentEntries);
        }
        return;
      }

      const entries = await this.fetchAuditTrailsForItems(allItems);
      sortAuditEntries(entries);

      this.currentEntries = entries;

      if (this.onDataChangedCallback) {
        this.onDataChangedCallback(this.currentEntries);
      }
    } catch (error) {
      console.error('Error loading all audits:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Refresh current data (called by SSE dataUpdated event)
   */
  async refresh() {
    // Subclass or user should override this to call appropriate load method
    throw new Error('refresh() must be implemented by subclass or caller');
  }

  /**
   * Get current entries
   */
  getCurrentEntries() {
    return this.currentEntries;
  }
}
