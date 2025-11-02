/**
 * ConfigurationSettings - Single source of truth for all configuration
 *
 * Responsibilities:
 * - Load/save localStorage configuration
 * - Load/save project configuration via daemon
 * - Manage statuses configuration
 * - Notify daemon to broadcast SSE after all saves complete
 * - Subscribe to SSE configurationUpdated events (with debouncing)
 * - Notify subscribers when configuration changes
 *
 * Architecture:
 * - Browser-only class (never instantiated in daemon)
 * - Single instance per browser tab
 * - All UX elements request config from this class
 * - All UX elements subscribe to onChange for updates
 */

import { subscribeToEvent } from './sparkle-common.js';

export class ConfigurationSettings {
  constructor() {
    // Current configuration values
    this.config = {
      darkMode: false,
      filters: {
        pending: 'all',
        monitor: 'all',
        ignored: 'not-ignored',
        taken: 'all'
      },
      statuses: ['incomplete', 'completed']
    };

    // Track our own SSE events to ignore them (debouncing)
    this.lastSaveId = null; // { timestamp, random }

    // Subscribers to onChange events
    this.changeSubscribers = new Set();

    // Track initialization state
    this.initialized = false;
  }

  /**
   * Initialize - load all settings from localStorage and daemon
   * Must be called before using this instance
   */
  async initialize() {
    if (this.initialized) {
      console.warn('ConfigurationSettings already initialized');
      return;
    }

    try {
      // Load localStorage config
      const localConfigStr = localStorage.getItem('sparkle.config');
      const localConfig = localConfigStr ? JSON.parse(localConfigStr) : null;

      // Fetch configuration from daemon (includes defaults, project, and merged)
      const response = await fetch('/api/config/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localConfig })
      });

      if (!response.ok) {
        throw new Error(`Failed to load configuration: ${response.statusText}`);
      }

      const configData = await response.json();

      // Fetch statuses separately
      const statusResponse = await fetch('/api/allowedStatuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to load statuses: ${statusResponse.statusText}`);
      }

      const statusData = await statusResponse.json();

      // Update internal state with merged config
      this.config = {
        darkMode: configData.merged.darkMode,
        filters: { ...configData.merged.filters },
        statuses: [...statusData.statuses]
      };

      this.initialized = true;

      // Subscribe to SSE configurationUpdated events
      subscribeToEvent('configurationUpdated', (e) => this.handleSSEConfigUpdate(e));

      // Notify subscribers after initialization
      this.notifySubscribers();

      console.log('ConfigurationSettings initialized:', this.config);
    } catch (error) {
      console.error('Failed to initialize ConfigurationSettings:', error);
      // Continue with default values
      this.initialized = true;
    }
  }

  /**
   * Handle SSE configurationUpdated event
   * Ignores our own events (debouncing)
   * Reloads config only if different from current
   */
  async handleSSEConfigUpdate(event) {
    console.log('ConfigurationSettings: Received SSE configurationUpdated event');

    try {
      const data = JSON.parse(event.data);
      const { sender } = data;

      console.log('ConfigurationSettings: SSE sender:', sender);
      console.log('ConfigurationSettings: My lastSaveId:', this.lastSaveId);

      // Ignore our own events (debouncing)
      if (sender && this.lastSaveId) {
        if (sender.timestamp === this.lastSaveId.timestamp &&
            sender.random === this.lastSaveId.random) {
          console.log('ConfigurationSettings: Ignoring own SSE event (debounced) - sender matches my lastSaveId');
          return;
        }
      }

      console.log('ConfigurationSettings: Processing SSE event (not from me)');

      // Reload configuration from daemon and localStorage
      const localConfigStr = localStorage.getItem('sparkle.config');
      const localConfig = localConfigStr ? JSON.parse(localConfigStr) : null;

      const response = await fetch('/api/config/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localConfig })
      });

      if (!response.ok) {
        console.error('Failed to reload configuration from SSE');
        return;
      }

      const configData = await response.json();

      // Fetch statuses
      const statusResponse = await fetch('/api/allowedStatuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const statusData = statusResponse.ok ? await statusResponse.json() : { statuses: this.config.statuses };

      // Check if anything actually changed
      const newConfig = {
        darkMode: configData.merged.darkMode,
        filters: { ...configData.merged.filters },
        statuses: [...statusData.statuses]
      };

      if (this.hasConfigChanged(this.config, newConfig)) {
        console.log('ConfigurationSettings: Configuration changed from SSE, updating');
        this.config = newConfig;
        this.notifySubscribers();
      } else {
        console.log('ConfigurationSettings: No configuration changes from SSE');
      }
    } catch (error) {
      console.error('Error handling SSE configurationUpdated:', error);
    }
  }

  /**
   * Check if configuration has changed
   */
  hasConfigChanged(oldConfig, newConfig) {
    // Check dark mode
    if (oldConfig.darkMode !== newConfig.darkMode) {
      return true;
    }

    // Check filters
    const oldFilters = oldConfig.filters;
    const newFilters = newConfig.filters;
    if (oldFilters.pending !== newFilters.pending ||
        oldFilters.monitor !== newFilters.monitor ||
        oldFilters.ignored !== newFilters.ignored ||
        oldFilters.taken !== newFilters.taken) {
      return true;
    }

    // Check statuses (compare arrays)
    if (oldConfig.statuses.length !== newConfig.statuses.length) {
      return true;
    }

    for (let i = 0; i < oldConfig.statuses.length; i++) {
      if (oldConfig.statuses[i] !== newConfig.statuses[i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Subscribe to configuration changes
   * @param {Function} callback - Called when configuration changes
   * @returns {Function} Unsubscribe function
   */
  onChange(callback) {
    this.changeSubscribers.add(callback);

    // Immediately invoke callback with current config if initialized
    if (this.initialized) {
      try {
        callback(this.config);
      } catch (error) {
        console.error('Error in configuration change subscriber (initial call):', error);
      }
    }

    // Return unsubscribe function
    return () => {
      this.changeSubscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of configuration change
   */
  notifySubscribers() {
    console.log(`ConfigurationSettings: Notifying ${this.changeSubscribers.size} subscribers`);
    this.changeSubscribers.forEach(callback => {
      try {
        callback(this.config);
      } catch (error) {
        console.error('Error in configuration change subscriber:', error);
      }
    });
  }

  /**
   * Get current configuration values
   */
  getConfig() {
    return {
      darkMode: this.config.darkMode,
      filters: { ...this.config.filters },
      statuses: [...this.config.statuses]
    };
  }

  /**
   * Update configuration
   * Saves to localStorage and/or project config as needed
   * Notifies daemon to broadcast SSE after all saves complete
   *
   * @param {Object} updates - Configuration updates
   * @param {Object} updates.local - localStorage config (darkMode, filters)
   * @param {Object} updates.project - Project config (darkMode, filters)
   * @param {Array<string>} updates.statuses - Custom statuses
   */
  async updateConfig(updates) {
    console.log('ConfigurationSettings: updateConfig called', updates);

    try {
      // Generate save ID for debouncing
      this.lastSaveId = {
        timestamp: Date.now(),
        random: Math.random()
      };

      // Track what we're saving
      const savingLocal = updates.local !== undefined;
      const savingProject = updates.project !== undefined;
      const savingStatuses = updates.statuses !== undefined;

      // Save to localStorage if provided
      if (savingLocal) {
        localStorage.setItem('sparkle.config', JSON.stringify(updates.local));
        console.log('ConfigurationSettings: Saved to localStorage');
      }

      // Save project config if provided
      let portChanged = false;
      if (savingProject) {
        const response = await fetch('/api/config/setProject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates.project)
        });

        if (!response.ok) {
          throw new Error('Failed to save project configuration');
        }

        const result = await response.json();
        portChanged = result.portChanged || false;
        console.log('ConfigurationSettings: Saved project config', { portChanged });

        // If port changed, notify sparkle-common to disable reconnection
        if (portChanged) {
          const { notifyPortChange } = await import('./sparkle-common.js');
          notifyPortChange();
        }
      }

      // Save statuses if provided
      if (savingStatuses) {
        const response = await fetch('/api/updateStatuses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statuses: updates.statuses })
        });

        if (!response.ok) {
          throw new Error('Failed to save statuses');
        }
        console.log('ConfigurationSettings: Saved statuses');
      }

      // All saves complete - notify daemon to broadcast SSE
      console.log('ConfigurationSettings: Sending notifyChange with sender:', JSON.stringify(this.lastSaveId));
      const notifyResponse = await fetch('/api/config/notifyChange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: this.lastSaveId })
      });

      if (!notifyResponse.ok) {
        throw new Error('Failed to notify configuration change');
      }

      console.log('ConfigurationSettings: Notified daemon to broadcast SSE');

      // Reload configuration to get merged values
      await this.reloadConfig();

    } catch (error) {
      console.error('Error updating configuration:', error);
      throw error;
    }
  }

  /**
   * Reload configuration from daemon (used after saves)
   */
  async reloadConfig() {
    const localConfigStr = localStorage.getItem('sparkle.config');
    const localConfig = localConfigStr ? JSON.parse(localConfigStr) : null;

    const response = await fetch('/api/config/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localConfig })
    });

    if (!response.ok) {
      throw new Error('Failed to reload configuration');
    }

    const configData = await response.json();

    // Fetch statuses
    const statusResponse = await fetch('/api/allowedStatuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const statusData = statusResponse.ok ? await statusResponse.json() : { statuses: this.config.statuses };

    // Update internal state
    this.config = {
      darkMode: configData.merged.darkMode,
      filters: { ...configData.merged.filters },
      statuses: [...statusData.statuses]
    };

    // Notify subscribers
    this.notifySubscribers();
  }
}
