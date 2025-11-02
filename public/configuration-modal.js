/**
 * Sparkle Configuration Modal
 * Reusable modal component for managing configuration
 */

import { modalStack } from './modal-stack.js';

/**
 * Configuration Modal Class
 * Manages application configuration (dark mode, filters, custom statuses)
 */
class ConfigurationModal {
  constructor() {
    this.id = `configurationModal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.state = 'not-populated'; // State machine: 'not-populated', 'clean', 'dirty'
    this.element = null;
    this.overlayElement = null;
    this.currentConfigData = null;
    this.lastSavedSnapshot = null;

    this.createDOM();
    this.setupEventHandlers();
    this.loadConfiguration();
  }

  createDOM() {
    // Inject styles once
    injectConfigurationModalStyles();

    const modalHTML = `
      <div id="${this.id}" class="sparkle-modal">
        <div class="sparkle-modal-overlay"></div>
        <div class="sparkle-modal-content size-large">
          <div class="sparkle-modal-header">
            <h3>Configuration</h3>
            <button class="sparkle-modal-close">&times;</button>
          </div>
          <div class="sparkle-modal-body config-modal-body">
            <div class="loading-state">Loading configuration...</div>
          </div>
          <div class="sparkle-modal-footer config-modal-footer">
            <button type="button" class="btn-secondary config-btn-cancel" disabled>Cancel</button>
            <button type="button" class="btn-primary config-btn-save" disabled>Save All</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    this.element = document.getElementById(this.id);
    this.overlayElement = this.element.querySelector('.sparkle-modal-overlay');
    this.bodyElement = this.element.querySelector('.sparkle-modal-body');
    this.saveBtn = this.element.querySelector('.config-btn-save');
    this.cancelBtn = this.element.querySelector('.config-btn-cancel');
  }

  setupEventHandlers() {
    // Close button
    const closeBtn = this.element.querySelector('.sparkle-modal-close');
    closeBtn.addEventListener('click', () => this.handleEscape());

    // Cancel button (same behavior as ESC)
    this.cancelBtn.addEventListener('click', () => this.handleEscape());

    // Save button
    this.saveBtn.addEventListener('click', () => this.save());

    // Overlay click - beep instead of close (modal stack handles this)
    this.overlayElement.addEventListener('click', () => {
      modalStack.beep();
    });
  }

  show() {
    this.element.classList.add('show');
    // Register with modal stack
    modalStack.push(this);
  }

  close() {
    // Remove from modal stack (which will call destroy())
    modalStack.remove(this);
  }

  destroy() {
    // Remove DOM element
    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    // Clear references
    this.overlayElement = null;
    this.bodyElement = null;
    this.saveBtn = null;
    this.cancelBtn = null;
    this.currentConfigData = null;
    this.lastSavedSnapshot = null;
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

  handleEscape() {
    if (this.state === 'dirty') {
      // Dirty state: Cancel changes and return to clean
      this.cancel();
    } else {
      // Clean or not-populated state: Close modal
      this.close();
    }
  }

  async loadConfiguration() {
    try {
      console.log('[CONFIG STATE] Loading configuration...');

      // Get localStorage config
      const localConfigStr = localStorage.getItem('sparkle.config');
      const localConfig = localConfigStr ? JSON.parse(localConfigStr) : null;

      // Get configuration from backend
      const response = await fetch('/api/config/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localConfig })
      });

      const configData = await response.json();
      if (!response.ok) {
        throw new Error(configData.error || 'Failed to load configuration');
      }

      this.currentConfigData = configData;

      // Get custom statuses from ConfigurationSettings
      const config = window.configSettings.getConfig();
      const customStatuses = config.statuses.filter(s => s !== 'incomplete' && s !== 'completed');

      // Render the configuration form
      this.renderConfigForm(configData, customStatuses);

      // Transition to clean state
      this.transitionToState('clean');

    } catch (error) {
      this.bodyElement.innerHTML = `<div class="error-state">Error: ${escapeHtml(error.message)}</div>`;
    }
  }

  renderConfigForm(configData, customStatuses) {
    const html = `
      <!-- General Settings Section -->
      <div class="config-section">
        <h4>General Settings</h4>
        <table class="config-table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Default</th>
              <th>Local (All Instances)</th>
              <th>Project</th>
              <th>Current Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Dark Mode</td>
              <td class="cfg-default">${configData.defaults.darkMode ? 'Dark' : 'Light'}</td>
              <td>
                <select class="config-dropdown cfg-darkMode-local">
                  <option value="">(none)</option>
                  <option value="false">Light</option>
                  <option value="true">Dark</option>
                </select>
              </td>
              <td>
                <select class="config-dropdown cfg-darkMode-project">
                  <option value="">(none)</option>
                  <option value="false">Light</option>
                  <option value="true">Dark</option>
                </select>
              </td>
              <td class="current-value cfg-darkMode-current">➜ ${configData.merged.darkMode ? 'Dark' : 'Light'}</td>
            </tr>
            <tr>
              <td>Fixed Port<br><span class="config-help-inline">For bookmarkable URLs. Requires daemon restart.</span></td>
              <td class="cfg-default">(ephemeral)</td>
              <td>
                <input type="text" class="config-input cfg-port-local" placeholder="(none)" disabled title="Port must be set at project level">
              </td>
              <td>
                <input type="number" class="config-input cfg-port-project" placeholder="(none)" min="1024" max="65535">
              </td>
              <td class="current-value cfg-port-current">➜ ${configData.merged.port || '(ephemeral)'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Default Filter Values Section -->
      <div class="config-section">
        <h4>Default Filter Values</h4>
        <table class="config-table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Default</th>
              <th>Local (All Instances)</th>
              <th>Project</th>
              <th>Current Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Pending Status</td>
              <td class="cfg-default">${this.formatFilterValue(configData.defaults.filters.pending)}</td>
              <td>
                <select class="config-dropdown cfg-filter-pending-local">
                  <option value="">(none)</option>
                  <option value="all">All items</option>
                  <option value="pending">Pending only</option>
                  <option value="not-pending">Not pending only</option>
                </select>
              </td>
              <td>
                <select class="config-dropdown cfg-filter-pending-project">
                  <option value="">(none)</option>
                  <option value="all">All items</option>
                  <option value="pending">Pending only</option>
                  <option value="not-pending">Not pending only</option>
                </select>
              </td>
              <td class="current-value cfg-filter-pending-current">➜ ${this.formatFilterValue(configData.merged.filters.pending)}</td>
            </tr>
            <tr>
              <td>Monitor Status</td>
              <td class="cfg-default">${this.formatFilterValue(configData.defaults.filters.monitor)}</td>
              <td>
                <select class="config-dropdown cfg-filter-monitor-local">
                  <option value="">(none)</option>
                  <option value="all">All items</option>
                  <option value="monitored">Monitored only</option>
                  <option value="not-monitored">Not monitored only</option>
                </select>
              </td>
              <td>
                <select class="config-dropdown cfg-filter-monitor-project">
                  <option value="">(none)</option>
                  <option value="all">All items</option>
                  <option value="monitored">Monitored only</option>
                  <option value="not-monitored">Not monitored only</option>
                </select>
              </td>
              <td class="current-value cfg-filter-monitor-current">➜ ${this.formatFilterValue(configData.merged.filters.monitor)}</td>
            </tr>
            <tr>
              <td>Ignored Status</td>
              <td class="cfg-default">${this.formatFilterValue(configData.defaults.filters.ignored)}</td>
              <td>
                <select class="config-dropdown cfg-filter-ignored-local">
                  <option value="">(none)</option>
                  <option value="all">All items</option>
                  <option value="ignored">Ignored only</option>
                  <option value="not-ignored">Not ignored only</option>
                </select>
              </td>
              <td>
                <select class="config-dropdown cfg-filter-ignored-project">
                  <option value="">(none)</option>
                  <option value="all">All items</option>
                  <option value="ignored">Ignored only</option>
                  <option value="not-ignored">Not ignored only</option>
                </select>
              </td>
              <td class="current-value cfg-filter-ignored-current">➜ ${this.formatFilterValue(configData.merged.filters.ignored)}</td>
            </tr>
            <tr>
              <td>Taken Status</td>
              <td class="cfg-default">${this.formatFilterValue(configData.defaults.filters.taken)}</td>
              <td>
                <select class="config-dropdown cfg-filter-taken-local">
                  <option value="">(none)</option>
                  <option value="all">All items</option>
                  <option value="taken">Taken only</option>
                  <option value="not-taken">Not taken only</option>
                </select>
              </td>
              <td>
                <select class="config-dropdown cfg-filter-taken-project">
                  <option value="">(none)</option>
                  <option value="all">All items</option>
                  <option value="taken">Taken only</option>
                  <option value="not-taken">Not taken only</option>
                </select>
              </td>
              <td class="current-value cfg-filter-taken-current">➜ ${this.formatFilterValue(configData.merged.filters.taken)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Custom Statuses Section -->
      <div class="config-section">
        <h4>Custom Item Statuses</h4>
        <p class="config-help">Enter one status per line. "incomplete" and "completed" are built-in and cannot be customized.</p>
        <textarea class="config-textarea" id="customStatuses" rows="5" placeholder="e.g., in-progress&#10;blocked&#10;review">${customStatuses.join('\n')}</textarea>
      </div>
    `;

    this.bodyElement.innerHTML = html;

    // Set current values in dropdowns
    this.setFormValues(configData);

    // Add change listeners to all form controls
    this.setupFormChangeListeners();
  }

  setFormValues(configData) {
    // Get local config from localStorage (API doesn't return it)
    const localConfigStr = localStorage.getItem('sparkle.config');
    const localConfig = localConfigStr ? JSON.parse(localConfigStr) : {};

    // Set dark mode values
    const darkModeLocal = localConfig.darkMode;
    const darkModeProject = configData.project.darkMode;

    this.element.querySelector('.cfg-darkMode-local').value =
      darkModeLocal === null || darkModeLocal === undefined ? '' : darkModeLocal ? 'true' : 'false';
    this.element.querySelector('.cfg-darkMode-project').value =
      darkModeProject === null || darkModeProject === undefined ? '' : darkModeProject ? 'true' : 'false';

    // Set port values (port is project-level only)
    const portProject = configData.project.port;
    this.element.querySelector('.cfg-port-project').value = portProject || '';

    // Set filter values
    const filters = ['pending', 'monitor', 'ignored', 'taken'];
    filters.forEach(filter => {
      const localVal = (localConfig.filters && localConfig.filters[filter]) || '';
      const projectVal = configData.project.filters[filter] || '';

      this.element.querySelector(`.cfg-filter-${filter}-local`).value = localVal;
      this.element.querySelector(`.cfg-filter-${filter}-project`).value = projectVal;
    });
  }

  setupFormChangeListeners() {
    // Get all dropdowns, inputs, and textarea
    const controls = this.element.querySelectorAll('.config-dropdown, .config-input, .config-textarea');

    controls.forEach(control => {
      control.addEventListener('change', () => this.onFormChange());
      // Also handle input events for text/number inputs
      if (control.tagName === 'INPUT') {
        control.addEventListener('input', () => this.onFormChange());
      }
    });

    // Also listen to textarea input
    const textarea = this.element.querySelector('.config-textarea');
    if (textarea) {
      textarea.addEventListener('input', () => this.onFormChange());
    }
  }

  onFormChange() {
    console.log('[CONFIG STATE] Form changed, current state:', this.state);

    // Update current values display
    this.updateCurrentValues();

    // Take snapshot of current form state
    const currentSnapshot = this.captureFormSnapshot();

    // Compare with last saved snapshot
    const hasChanges = JSON.stringify(currentSnapshot) !== JSON.stringify(this.lastSavedSnapshot);

    const newState = hasChanges ? 'dirty' : 'clean';

    if (newState !== this.state) {
      this.transitionToState(newState);
    }
  }

  updateCurrentValues() {
    // Update Dark Mode current value
    const localDarkMode = this.parseConfigValue(this.element.querySelector('.cfg-darkMode-local').value);
    const projectDarkMode = this.parseConfigValue(this.element.querySelector('.cfg-darkMode-project').value);
    const currentDarkMode = projectDarkMode !== null ? projectDarkMode : localDarkMode;
    this.element.querySelector('.cfg-darkMode-current').textContent = `➜ ${currentDarkMode ? 'Dark' : 'Light'}`;

    // Update Port current value
    const portProject = this.element.querySelector('.cfg-port-project').value;
    const currentPort = portProject ? parseInt(portProject, 10) : null;
    this.element.querySelector('.cfg-port-current').textContent = `➜ ${currentPort || '(ephemeral)'}`;

    // Update filter current values
    const filters = ['pending', 'monitor', 'ignored', 'taken'];
    filters.forEach(filter => {
      const localVal = this.element.querySelector(`.cfg-filter-${filter}-local`).value;
      const projectVal = this.element.querySelector(`.cfg-filter-${filter}-project`).value;
      const currentVal = projectVal || localVal || this.currentConfigData.defaults.filters[filter];
      this.element.querySelector(`.cfg-filter-${filter}-current`).textContent = `➜ ${this.formatFilterValue(currentVal)}`;
    });
  }

  captureFormSnapshot() {
    return {
      localDarkMode: this.element.querySelector('.cfg-darkMode-local').value,
      projectDarkMode: this.element.querySelector('.cfg-darkMode-project').value,
      projectPort: this.element.querySelector('.cfg-port-project').value,
      localPending: this.element.querySelector('.cfg-filter-pending-local').value,
      projectPending: this.element.querySelector('.cfg-filter-pending-project').value,
      localMonitor: this.element.querySelector('.cfg-filter-monitor-local').value,
      projectMonitor: this.element.querySelector('.cfg-filter-monitor-project').value,
      localIgnored: this.element.querySelector('.cfg-filter-ignored-local').value,
      projectIgnored: this.element.querySelector('.cfg-filter-ignored-project').value,
      localTaken: this.element.querySelector('.cfg-filter-taken-local').value,
      projectTaken: this.element.querySelector('.cfg-filter-taken-project').value,
      customStatuses: this.element.querySelector('.config-textarea').value
    };
  }

  transitionToState(newState) {
    console.log(`[CONFIG STATE] State transition from '${this.state}' to '${newState}'`);
    this.state = newState;

    if (newState === 'clean') {
      // Capture snapshot when transitioning to clean
      this.lastSavedSnapshot = this.captureFormSnapshot();
    }

    this.updateButtons();
  }

  updateButtons() {
    const isDirty = this.state === 'dirty';
    this.saveBtn.disabled = !isDirty;
    this.cancelBtn.disabled = !isDirty;
  }

  cancel() {
    console.log('[CONFIG STATE] Canceling changes, restoring last saved snapshot');

    if (!this.lastSavedSnapshot) return;

    // Restore values from lastSavedSnapshot
    this.element.querySelector('.cfg-darkMode-local').value = this.lastSavedSnapshot.localDarkMode;
    this.element.querySelector('.cfg-darkMode-project').value = this.lastSavedSnapshot.projectDarkMode;
    this.element.querySelector('.cfg-port-project').value = this.lastSavedSnapshot.projectPort;
    this.element.querySelector('.cfg-filter-pending-local').value = this.lastSavedSnapshot.localPending;
    this.element.querySelector('.cfg-filter-pending-project').value = this.lastSavedSnapshot.projectPending;
    this.element.querySelector('.cfg-filter-monitor-local').value = this.lastSavedSnapshot.localMonitor;
    this.element.querySelector('.cfg-filter-monitor-project').value = this.lastSavedSnapshot.projectMonitor;
    this.element.querySelector('.cfg-filter-ignored-local').value = this.lastSavedSnapshot.localIgnored;
    this.element.querySelector('.cfg-filter-ignored-project').value = this.lastSavedSnapshot.projectIgnored;
    this.element.querySelector('.cfg-filter-taken-local').value = this.lastSavedSnapshot.localTaken;
    this.element.querySelector('.cfg-filter-taken-project').value = this.lastSavedSnapshot.projectTaken;
    this.element.querySelector('.config-textarea').value = this.lastSavedSnapshot.customStatuses;

    // Transition to clean state
    this.transitionToState('clean');
  }

  async save() {
    try {
      console.log('[CONFIG STATE] Saving configuration...');

      // Collect local config
      const localConfig = {
        darkMode: this.parseConfigValue(this.element.querySelector('.cfg-darkMode-local').value),
        filters: {
          pending: this.element.querySelector('.cfg-filter-pending-local').value || null,
          monitor: this.element.querySelector('.cfg-filter-monitor-local').value || null,
          ignored: this.element.querySelector('.cfg-filter-ignored-local').value || null,
          taken: this.element.querySelector('.cfg-filter-taken-local').value || null
        }
      };

      // Collect project config
      const portValue = this.element.querySelector('.cfg-port-project').value;
      const projectConfig = {
        darkMode: this.parseConfigValue(this.element.querySelector('.cfg-darkMode-project').value),
        filters: {
          pending: this.element.querySelector('.cfg-filter-pending-project').value || null,
          monitor: this.element.querySelector('.cfg-filter-monitor-project').value || null,
          ignored: this.element.querySelector('.cfg-filter-ignored-project').value || null,
          taken: this.element.querySelector('.cfg-filter-taken-project').value || null
        },
        port: portValue ? parseInt(portValue, 10) : null
      };

      // Collect statuses
      const customStatuses = this.element.querySelector('.config-textarea').value.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // Use ConfigurationSettings to save everything
      await window.configSettings.updateConfig({
        local: localConfig,
        project: projectConfig,
        statuses: customStatuses
      });

      console.log('[CONFIG STATE] Configuration saved successfully');

      // Transition to clean state
      this.transitionToState('clean');

      // Show success message
      if (window.showToast) {
        window.showToast('Configuration saved', 'success');
      }

    } catch (error) {
      console.error('[CONFIG STATE] Error saving configuration:', error);
      if (window.showToast) {
        window.showToast(`Error: ${error.message}`, 'error');
      }
    }
  }

  parseConfigValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }

  formatFilterValue(value) {
    const map = {
      'all': 'All',
      'pending': 'Pending only',
      'not-pending': 'Not pending only',
      'monitored': 'Monitored only',
      'not-monitored': 'Not monitored only',
      'ignored': 'Ignored only',
      'not-ignored': 'Not ignored only',
      'taken': 'Taken only',
      'not-taken': 'Not taken only'
    };
    return map[value] || 'All';
  }
}

/**
 * Open configuration modal
 * @returns {ConfigurationModal} The modal instance
 */
export function openConfigurationModal() {
  const instance = new ConfigurationModal();
  instance.show();
  return instance;
}

/**
 * Helper functions
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Inject minimal configuration-modal-specific CSS styles (once)
 * Most styles come from sparkle-base.css
 */
function injectConfigurationModalStyles() {
  if (document.getElementById('configurationModalStyles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'configurationModalStyles';
  style.textContent = `
    /* Configuration Modal Specific Styles */

    .config-modal-body {
      max-height: 70vh;
      overflow-y: auto;
    }

    .config-modal-footer {
      position: sticky;
      bottom: 0;
      background: var(--modal-bg);
    }

    .config-section {
      margin-bottom: 30px;
    }

    .config-section h4 {
      color: var(--primary-color, #667eea);
      margin: 0 0 15px 0;
      font-size: 16px;
    }

    .config-help {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 10px;
    }

    .config-help-inline {
      font-size: 11px;
      color: var(--text-tertiary);
      font-weight: normal;
    }

    .config-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    .config-table th,
    .config-table td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }

    .config-table th {
      background: var(--bg-secondary);
      font-weight: 600;
      color: var(--text-primary);
      font-size: 14px;
    }

    .config-table td {
      color: var(--text-primary);
      font-size: 14px;
    }

    .config-dropdown {
      width: 100%;
      padding: 6px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--input-bg);
      color: var(--text-primary);
    }

    .config-input {
      width: 100%;
      padding: 6px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--input-bg);
      color: var(--text-primary);
      font-size: 14px;
    }

    .config-input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .config-textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--input-bg);
      color: var(--text-primary);
      font-family: monospace;
      resize: vertical;
    }

    .current-value {
      font-weight: 600;
      color: var(--primary-color, #667eea);
    }

    .cfg-default {
      color: var(--text-tertiary);
      font-style: italic;
    }
  `;

  document.head.appendChild(style);
}
