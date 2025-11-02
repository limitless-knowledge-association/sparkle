/**
 * Sparkle Item Editor - Component-Based Architecture
 * Reusable modal component for viewing and editing items
 */

import { openDependencyManager } from './dependency-manager.js';
import { openAuditTrail } from './audit-trail.js';
import { subscribeToEvent } from './sparkle-common.js';
import { modalStack } from './modal-stack.js';

/**
 * Base Component Class
 * All item editor components inherit from this
 */
class Component {
  constructor(container, itemEditor) {
    this.container = container;
    this.itemEditor = itemEditor; // Reference to parent ItemEditorModal
    this.element = null;
  }

  /**
   * Render the component into its container
   * Override in subclasses
   */
  render(data) {
    throw new Error('render() must be implemented by subclass');
  }

  /**
   * Update the component with new data
   * Override in subclasses if needed
   */
  update(data) {
    this.render(data);
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.element = null;
  }
}

/**
 * Tagline Component - Manages tagline editing
 * Dirty-aware: notifies parent when changed
 */
class TaglineComponent extends Component {
  constructor(container, itemEditor) {
    super(container, itemEditor);
    this.originalTagline = '';
    this.serverTagline = '';
  }

  render(data) {
    this.originalTagline = data.tagline;
    this.serverTagline = data.tagline;

    const html = `
      <div class="detail-row">
        <div class="detail-label">Tagline:</div>
        <div class="detail-value" style="flex-direction: column; align-items: stretch;">
          <div class="message warning item-tagline-stale-warning" style="display: none; margin-bottom: 8px;">
            <strong>Warning:</strong> Current saved value: <span class="item-tagline-stale-value"></span>
          </div>
          <div class="input-group">
            <input type="text" class="item-tagline-input" value="${escapeHtml(data.tagline)}" />
            <button class="btn-secondary item-btn-restore-tagline" style="display: none;">Restore</button>
            <button class="btn-primary item-btn-save-tagline" disabled>OK</button>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    const input = this.container.querySelector('.item-tagline-input');
    const saveBtn = this.container.querySelector('.item-btn-save-tagline');
    const restoreBtn = this.container.querySelector('.item-btn-restore-tagline');

    // Input change enables/disables button and notifies parent
    input.addEventListener('input', () => {
      const hasChanges = input.value !== this.originalTagline;
      saveBtn.disabled = !hasChanges;
      this.itemEditor.onComponentChange();
    });

    // Enter key saves
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !saveBtn.disabled) {
        this.save();
      }
    });

    // Save button
    saveBtn.addEventListener('click', () => this.save());

    // Restore button
    restoreBtn.addEventListener('click', () => this.restore());
  }

  async save() {
    const input = this.container.querySelector('.item-tagline-input');
    const saveBtn = this.container.querySelector('.item-btn-save-tagline');
    const newTagline = input.value.trim();

    if (!newTagline) {
      showToast('Tagline cannot be empty', 'error');
      return;
    }

    try {
      saveBtn.disabled = true;
      await apiCall('/api/updateTagline', {
        itemId: this.itemEditor.itemId,
        tagline: newTagline
      });

      this.originalTagline = newTagline;
      this.serverTagline = newTagline;
      showToast('Tagline updated');
      this.itemEditor.onComponentChange();
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
      saveBtn.disabled = false;
    }
  }

  restore() {
    const input = this.container.querySelector('.item-tagline-input');
    const saveBtn = this.container.querySelector('.item-btn-save-tagline');
    const staleWarning = this.container.querySelector('.item-tagline-stale-warning');
    const restoreBtn = this.container.querySelector('.item-btn-restore-tagline');

    input.value = this.serverTagline;
    this.originalTagline = this.serverTagline;
    saveBtn.disabled = true;
    staleWarning.style.display = 'none';
    restoreBtn.style.display = 'none';
    this.itemEditor.onComponentChange();
  }

  isDirty() {
    const input = this.container.querySelector('.item-tagline-input');
    const saveBtn = this.container.querySelector('.item-btn-save-tagline');
    return input && saveBtn && !saveBtn.disabled;
  }

  cancel() {
    const input = this.container.querySelector('.item-tagline-input');
    const saveBtn = this.container.querySelector('.item-btn-save-tagline');
    const staleWarning = this.container.querySelector('.item-tagline-stale-warning');
    const restoreBtn = this.container.querySelector('.item-btn-restore-tagline');

    input.value = this.originalTagline;
    saveBtn.disabled = true;
    if (staleWarning) staleWarning.style.display = 'none';
    if (restoreBtn) restoreBtn.style.display = 'none';
  }

  update(data) {
    // Handle server updates while preserving user edits
    const input = this.container.querySelector('.item-tagline-input');
    const staleWarning = this.container.querySelector('.item-tagline-stale-warning');
    const staleValue = this.container.querySelector('.item-tagline-stale-value');
    const restoreBtn = this.container.querySelector('.item-btn-restore-tagline');

    if (!input) return;

    const userValue = input.value;
    const hasUserEdits = userValue !== this.originalTagline;

    if (hasUserEdits && data.tagline !== this.originalTagline) {
      // Server changed while user was editing - show warning
      this.serverTagline = data.tagline;
      staleValue.textContent = data.tagline;
      staleWarning.style.display = 'block';
      restoreBtn.style.display = 'block';
    } else if (!hasUserEdits) {
      // No user edits, update to latest
      input.value = data.tagline;
      this.originalTagline = data.tagline;
      this.serverTagline = data.tagline;
      staleWarning.style.display = 'none';
      restoreBtn.style.display = 'none';
    }
  }
}

/**
 * Status Component - Manages status dropdown
 */
class StatusComponent extends Component {
  render(data) {
    let html = `
      <div class="detail-row">
        <div class="detail-label">Status:</div>
        <div class="detail-value">
          <select class="item-status-select">`;

    for (const status of data.statuses) {
      const selected = status === data.currentStatus ? 'selected' : '';
      html += `<option value="${escapeHtml(status)}" ${selected}>${escapeHtml(status)}</option>`;
    }

    html += `</select>
        </div>
      </div>`;

    this.container.innerHTML = html;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    const dropdown = this.container.querySelector('.item-status-select');
    dropdown.addEventListener('change', () => this.onChange());
  }

  async onChange() {
    const dropdown = this.container.querySelector('.item-status-select');
    const newStatus = dropdown.value;

    try {
      await apiCall('/api/updateStatus', {
        itemId: this.itemEditor.itemId,
        status: newStatus,
        text: ''
      });
      showToast('Status updated');
      this.itemEditor.notifyStatusCallbacks();
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
      // Reload to reset dropdown
      this.itemEditor.reload();
    }
  }

  update(data) {
    const dropdown = this.container.querySelector('.item-status-select');
    if (dropdown && dropdown.value !== data.currentStatus) {
      dropdown.value = data.currentStatus;
    }
  }
}

/**
 * Monitoring Component - Manages monitoring checkbox
 */
class MonitoringComponent extends Component {
  render(data) {
    const isMonitoring = data.monitors && data.monitors.length > 0 && data.currentUser
      ? data.monitors.some(m => m.name === data.currentUser.name && m.email === data.currentUser.email)
      : false;

    const checkedAttr = isMonitoring ? 'checked' : '';
    const html = `
      <div class="detail-row">
        <div class="detail-label">Monitoring:</div>
        <div class="detail-value">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" class="item-monitoring-checkbox" ${checkedAttr} style="cursor: pointer; width: auto;" />
            <span class="text-small text-muted">Monitor this item</span>
          </label>
        </div>
      </div>`;

    this.container.innerHTML = html;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    const checkbox = this.container.querySelector('.item-monitoring-checkbox');
    checkbox.addEventListener('change', () => this.toggle());
  }

  async toggle() {
    const checkbox = this.container.querySelector('.item-monitoring-checkbox');
    const shouldMonitor = checkbox.checked;

    try {
      if (shouldMonitor) {
        await apiCall('/api/addMonitor', { itemId: this.itemEditor.itemId });
        showToast('Now monitoring this item');
      } else {
        await apiCall('/api/removeMonitor', { itemId: this.itemEditor.itemId });
        showToast('Stopped monitoring this item');
      }
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
      // Reload to reset checkbox
      this.itemEditor.reload();
    }
  }

  update(data) {
    const checkbox = this.container.querySelector('.item-monitoring-checkbox');
    if (checkbox && data.currentUser) {
      const isMonitoring = data.monitors && data.monitors.length > 0
        ? data.monitors.some(m => m.name === data.currentUser.name && m.email === data.currentUser.email)
        : false;

      if (checkbox.checked !== isMonitoring) {
        checkbox.checked = isMonitoring;
      }
    }
  }
}

/**
 * Visibility Component - Manages ignore/un-ignore button
 */
class VisibilityComponent extends Component {
  render(data) {
    const isIgnored = data.ignored === true;
    const buttonClass = isIgnored ? 'btn-danger item-btn-ignore-active' : 'btn-secondary item-btn-ignore';
    const buttonText = isIgnored ? '👁️ Un-ignore' : '🚫 Ignore';

    const html = `
      <div class="detail-row">
        <div class="detail-label">Visibility:</div>
        <div class="detail-value">
          <button class="${buttonClass}">${buttonText}</button>
        </div>
      </div>`;

    this.container.innerHTML = html;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    const button = this.container.querySelector('button');
    button.addEventListener('click', () => this.toggle());
  }

  async toggle() {
    const button = this.container.querySelector('button');
    const originalHTML = button.innerHTML;
    const originalClass = button.className;

    button.disabled = true;
    button.innerHTML = '...';

    try {
      const details = await apiCall('/api/getItemDetails', { itemId: this.itemEditor.itemId });
      const endpoint = details.ignored ? '/api/unignoreItem' : '/api/ignoreItem';
      const action = details.ignored ? 'un-ignored' : 'ignored';

      await apiCall(endpoint, { itemId: this.itemEditor.itemId });
      showToast(`Item ${action}`);

      // Update button immediately
      const newClass = details.ignored ? 'btn-secondary item-btn-ignore' : 'btn-danger item-btn-ignore-active';
      const newText = details.ignored ? '🚫 Ignore' : '👁️ Un-ignore';
      button.className = newClass;
      button.innerHTML = newText;
      button.disabled = false;
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
      button.className = originalClass;
      button.innerHTML = originalHTML;
      button.disabled = false;
    }
  }

  update(data) {
    const button = this.container.querySelector('button');
    if (button) {
      const isIgnored = data.ignored === true;
      const expectedClass = isIgnored ? 'btn-danger item-btn-ignore-active' : 'btn-secondary item-btn-ignore';
      const expectedText = isIgnored ? '👁️ Un-ignore' : '🚫 Ignore';

      if (button.className !== expectedClass) {
        button.className = expectedClass;
        button.innerHTML = expectedText;
      }
    }
  }
}

/**
 * Responsibility Component - Manages taken/surrender button
 */
class ResponsibilityComponent extends Component {
  render(data) {
    const currentUserHasIt = data.takenBy && data.currentUser &&
                              data.takenBy.name === data.currentUser.name &&
                              data.takenBy.email === data.currentUser.email;
    const someoneTookIt = data.takenBy && !currentUserHasIt;

    let buttonClass, buttonText;
    if (currentUserHasIt) {
      buttonClass = 'btn-success item-btn-taken-active';
      buttonText = '✓ Taken by You - Click to Surrender';
    } else if (someoneTookIt) {
      buttonClass = 'btn-secondary item-btn-taken-other';
      buttonText = `👤 Taken by ${escapeHtml(data.takenBy.name)} - Click to Take`;
    } else {
      buttonClass = 'btn-primary item-btn-taken';
      buttonText = '👤 Take Responsibility';
    }

    const html = `
      <div class="detail-row">
        <div class="detail-label">Responsibility:</div>
        <div class="detail-value">
          <button class="${buttonClass}">${buttonText}</button>
        </div>
      </div>`;

    this.container.innerHTML = html;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    const button = this.container.querySelector('button');
    button.addEventListener('click', () => this.toggle());
  }

  async toggle() {
    const button = this.container.querySelector('button');
    button.disabled = true;

    try {
      const details = await apiCall('/api/getItemDetails', { itemId: this.itemEditor.itemId });

      const currentUserHasIt = details.takenBy && details.currentUser &&
                                details.takenBy.name === details.currentUser.name &&
                                details.takenBy.email === details.currentUser.email;

      const endpoint = currentUserHasIt ? '/api/surrenderItem' : '/api/takeItem';
      const action = currentUserHasIt ? 'surrendered' : 'taken';

      await apiCall(endpoint, { itemId: this.itemEditor.itemId });
      showToast(`Item ${action}`);
      button.disabled = false;
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
      button.disabled = false;
    }
  }

  update(data) {
    const button = this.container.querySelector('button');
    if (button && data.currentUser) {
      const currentUserHasIt = data.takenBy &&
                                data.takenBy.name === data.currentUser.name &&
                                data.takenBy.email === data.currentUser.email;
      const someoneTookIt = data.takenBy && !currentUserHasIt;

      let expectedClass, expectedText;
      if (currentUserHasIt) {
        expectedClass = 'btn-success item-btn-taken-active';
        expectedText = '✓ Taken by You - Click to Surrender';
      } else if (someoneTookIt) {
        expectedClass = 'btn-secondary item-btn-taken-other';
        expectedText = `👤 Taken by ${escapeHtml(data.takenBy.name)} - Click to Take`;
      } else {
        expectedClass = 'btn-primary item-btn-taken';
        expectedText = '👤 Take Responsibility';
      }

      if (button.className !== expectedClass || button.innerHTML !== expectedText) {
        button.className = expectedClass;
        button.innerHTML = expectedText;
      }
    }
  }
}

/**
 * Metadata Component - Displays created date and creator
 */
class MetadataComponent extends Component {
  render(data) {
    const html = `
      <div class="detail-row">
        <div class="detail-label">Created:</div>
        <div class="detail-value">${new Date(data.created).toLocaleString()}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Creator:</div>
        <div class="detail-value">${escapeHtml(data.person.name)} (${escapeHtml(data.person.email)})</div>
      </div>`;

    this.container.innerHTML = html;
  }

  update(data) {
    // Metadata doesn't change, no need to update
  }
}

/**
 * Graph Controls Component - Needs, Supports, Inspector buttons
 */
class GraphControlsComponent extends Component {
  render(data) {
    const html = `
      <div class="button-group mt-md">
        <button class="btn-primary item-btn-needs">Needs</button>
        <button class="btn-primary item-btn-supports">Supports</button>
        <button class="btn-secondary item-btn-inspector">🔍 Open in Inspector</button>
      </div>`;

    this.container.innerHTML = html;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    const needsBtn = this.container.querySelector('.item-btn-needs');
    const supportsBtn = this.container.querySelector('.item-btn-supports');
    const inspectorBtn = this.container.querySelector('.item-btn-inspector');

    needsBtn.addEventListener('click', () => this.manageDependencies('dependencies'));
    supportsBtn.addEventListener('click', () => this.manageDependencies('dependents'));
    inspectorBtn.addEventListener('click', () => this.openInspector());
  }

  async manageDependencies(type) {
    openDependencyManager(this.itemEditor.itemId, type);
  }

  openInspector() {
    const inspectorUrl = `/inspector.html?itemId=${encodeURIComponent(this.itemEditor.itemId)}`;
    window.open(inspectorUrl, '_blank');
  }
}

/**
 * Entries Component - Manages entry list and new entry input
 * Dirty-aware: notifies parent when text is typed
 */
class EntriesComponent extends Component {
  render(data) {
    let html = `
      <div class="section mt-md">
        <h3 class="section-header">Add Entry</h3>
        <div class="form-group">
          <textarea class="item-new-entry-text" placeholder="Enter your note or update..."></textarea>
        </div>
        <div class="button-group">
          <button class="btn-primary item-btn-add-entry" disabled>Add Entry</button>
          <button class="btn-secondary item-btn-audit-trail">Audit Trail</button>
        </div>
      </div>`;

    // Existing entries
    if (data.entries && data.entries.length > 0) {
      html += '<div class="section mt-md">';
      html += '<h3 class="section-header">Previous Entries</h3>';
      html += '<ul class="item-list">';
      for (const entry of data.entries) {
        html += `<li class="item-list-item">`;
        html += `<div class="text-small text-muted mb-sm">${escapeHtml(entry.person.name)} - ${new Date(entry.person.timestamp).toLocaleString()}</div>`;
        html += `<div>${escapeHtml(entry.text)}</div>`;
        html += `</li>`;
      }
      html += '</ul>';
      html += '</div>';
    }

    this.container.innerHTML = html;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    const textarea = this.container.querySelector('.item-new-entry-text');
    const addBtn = this.container.querySelector('.item-btn-add-entry');
    const auditBtn = this.container.querySelector('.item-btn-audit-trail');

    // Textarea input enables/disables button and notifies parent
    textarea.addEventListener('input', () => {
      const hasText = textarea.value.trim().length > 0;
      addBtn.disabled = !hasText;
      this.itemEditor.onComponentChange();
    });

    // Add entry button
    addBtn.addEventListener('click', () => this.addEntry());

    // Audit trail button
    auditBtn.addEventListener('click', () => this.openAuditTrail());
  }

  async addEntry() {
    const textarea = this.container.querySelector('.item-new-entry-text');
    const addBtn = this.container.querySelector('.item-btn-add-entry');
    const text = textarea.value.trim();

    if (!text) return;

    try {
      addBtn.disabled = true;
      await apiCall('/api/addEntry', {
        itemId: this.itemEditor.itemId,
        text: text
      });

      textarea.value = '';
      showToast('Entry added');
      this.itemEditor.onComponentChange();

      // Reload to show new entry
      this.itemEditor.reload();
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
      addBtn.disabled = false;
    }
  }

  openAuditTrail() {
    openAuditTrail(this.itemEditor.itemId);
  }

  isDirty() {
    const textarea = this.container.querySelector('.item-new-entry-text');
    const addBtn = this.container.querySelector('.item-btn-add-entry');
    return textarea && addBtn && !addBtn.disabled;
  }

  cancel() {
    const textarea = this.container.querySelector('.item-new-entry-text');
    const addBtn = this.container.querySelector('.item-btn-add-entry');
    if (textarea) textarea.value = '';
    if (addBtn) addBtn.disabled = true;
  }

  update(data) {
    // Update entries list
    const entriesSection = this.container.querySelectorAll('.section')[1]; // Second section is the entries list

    if (data.entries && data.entries.length > 0) {
      let html = '<div class="section mt-md">';
      html += '<h3 class="section-header">Previous Entries</h3>';
      html += '<ul class="item-list">';
      for (const entry of data.entries) {
        html += `<li class="item-list-item">`;
        html += `<div class="text-small text-muted mb-sm">${escapeHtml(entry.person.name)} - ${new Date(entry.person.timestamp).toLocaleString()}</div>`;
        html += `<div>${escapeHtml(entry.text)}</div>`;
        html += `</li>`;
      }
      html += '</ul>';
      html += '</div>';

      if (entriesSection) {
        entriesSection.outerHTML = html;
      } else {
        this.container.insertAdjacentHTML('beforeend', html);
      }
    } else if (entriesSection) {
      entriesSection.remove();
    }
  }
}

/**
 * Item Editor Modal - Container with state machine
 */
class ItemEditorModal {
  constructor(itemId) {
    this.id = `itemEditorModal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.itemId = itemId;
    this.state = 'clean'; // State machine: 'clean' or 'dirty'
    this.statusUpdateCallbacks = [];
    this.element = null;
    this.overlayElement = null;
    this.bodyElement = null;
    this.headerIdElement = null;
    this.unsubscribeAggregateUpdate = null;
    this.unsubscribeServerDisconnected = null;

    // Components
    this.components = {};

    // Data cache
    this.itemDetails = null;
    this.allowedStatuses = null;

    this.createDOM();
    this.setupEventHandlers();
    this.loadItemDetails();
  }

  createDOM() {
    // Inject styles once (minimal item-editor-specific styles)
    injectItemEditorStyles();

    const modalHTML = `
      <div id="${this.id}" class="sparkle-modal">
        <div class="sparkle-modal-overlay"></div>
        <div class="sparkle-modal-content size-large">
          <div class="sparkle-modal-header">
            <h3>Item Details <span class="item-editor-header-id" title="Double-click to copy"></span></h3>
            <button class="sparkle-modal-close">&times;</button>
          </div>
          <div class="sparkle-modal-body">
            <div class="loading-state">Loading...</div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    this.element = document.getElementById(this.id);
    this.overlayElement = this.element.querySelector('.sparkle-modal-overlay');
    this.bodyElement = this.element.querySelector('.sparkle-modal-body');
    this.headerIdElement = this.element.querySelector('.item-editor-header-id');
  }

  setupEventHandlers() {
    // Close button
    const closeBtn = this.element.querySelector('.sparkle-modal-close');
    closeBtn.addEventListener('click', () => this.close());

    // Header ID double-click to copy
    this.headerIdElement.addEventListener('dblclick', () => this.copyItemId());

    // Overlay click - beep instead of close (modal stack handles this)
    const overlay = this.element.querySelector('.sparkle-modal-overlay');
    overlay.addEventListener('click', () => {
      modalStack.beep();
    });

    // Subscribe to SSE aggregatesUpdated events
    this.unsubscribeAggregateUpdate = subscribeToEvent('aggregatesUpdated', async (e) => {
      if (this.element && this.element.classList.contains('show') && this.itemId) {
        const data = JSON.parse(e.data);
        if (data.itemIds.includes(this.itemId)) {
          console.log('Item editor: Current item updated, reloading item details for item:', this.itemId);
          await this.reload(true); // Pass true to preserve user edits
        }
      }
    });

    // Subscribe to server disconnection
    this.unsubscribeServerDisconnected = subscribeToEvent('serverDisconnected', () => {
      console.log('Item editor: Server disconnected, closing modal');
      this.close();
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
    // Destroy all components
    Object.values(this.components).forEach(component => component.destroy());
    this.components = {};

    // Unsubscribe from SSE events
    if (this.unsubscribeAggregateUpdate) {
      this.unsubscribeAggregateUpdate();
      this.unsubscribeAggregateUpdate = null;
    }

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
    this.overlayElement = null;
    this.bodyElement = null;
    this.headerIdElement = null;
    this.statusUpdateCallbacks = [];
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
      // Dirty state: Cancel changes
      this.cancelChanges();
    } else {
      // Clean state: Close modal
      this.close();
    }
  }

  cancelChanges() {
    // Cancel changes in dirty-aware components
    if (this.components.tagline) {
      this.components.tagline.cancel();
    }
    if (this.components.entries) {
      this.components.entries.cancel();
    }

    // Transition to clean state
    this.transitionToState('clean');
  }

  onComponentChange() {
    // Called by components when their state changes
    this.evaluateState();
  }

  evaluateState() {
    // Check if any dirty-aware component is dirty
    const taglineDirty = this.components.tagline?.isDirty() || false;
    const entriesDirty = this.components.entries?.isDirty() || false;

    const newState = (taglineDirty || entriesDirty) ? 'dirty' : 'clean';

    if (newState !== this.state) {
      this.transitionToState(newState);
    }
  }

  transitionToState(newState) {
    console.log(`Item editor: State transition from '${this.state}' to '${newState}'`);
    this.state = newState;
    // Note: Unlike dependency-manager, item editor doesn't have Save/Cancel buttons
    // State is only used for ESC key behavior
  }

  async loadItemDetails() {
    try {
      const [details, statusesResult] = await Promise.all([
        apiCall('/api/getItemDetails', { itemId: this.itemId }),
        apiCall('/api/allowedStatuses')
      ]);

      this.itemDetails = details;
      this.allowedStatuses = statusesResult.statuses;

      this.renderComponents();
    } catch (error) {
      this.bodyElement.innerHTML = `<div class="error-state">Error: ${escapeHtml(error.message)}</div>`;
    }
  }

  async reload(preserveEdits = false) {
    try {
      const [details, statusesResult] = await Promise.all([
        apiCall('/api/getItemDetails', { itemId: this.itemId }),
        apiCall('/api/allowedStatuses')
      ]);

      this.itemDetails = details;
      this.allowedStatuses = statusesResult.statuses;

      if (preserveEdits) {
        this.updateComponents();
      } else {
        this.renderComponents();
      }
    } catch (error) {
      console.error('Failed to reload item details:', error);
    }
  }

  renderComponents() {
    // Update header
    this.headerIdElement.textContent = this.itemDetails.itemId;

    // Clear body and create component containers
    this.bodyElement.innerHTML = `
      <div class="item-detail-view">
        <div id="tagline-container"></div>
        <div id="status-container"></div>
        <div id="monitoring-container"></div>
        <div id="visibility-container"></div>
        <div id="responsibility-container"></div>
        <div id="metadata-container"></div>
      </div>
      <div id="controls-container"></div>
      <div id="entries-container"></div>
    `;

    // Create and render all components
    const containers = {
      tagline: this.bodyElement.querySelector('#tagline-container'),
      status: this.bodyElement.querySelector('#status-container'),
      monitoring: this.bodyElement.querySelector('#monitoring-container'),
      visibility: this.bodyElement.querySelector('#visibility-container'),
      responsibility: this.bodyElement.querySelector('#responsibility-container'),
      metadata: this.bodyElement.querySelector('#metadata-container'),
      controls: this.bodyElement.querySelector('#controls-container'),
      entries: this.bodyElement.querySelector('#entries-container')
    };

    this.components.tagline = new TaglineComponent(containers.tagline, this);
    this.components.status = new StatusComponent(containers.status, this);
    this.components.monitoring = new MonitoringComponent(containers.monitoring, this);
    this.components.visibility = new VisibilityComponent(containers.visibility, this);
    this.components.responsibility = new ResponsibilityComponent(containers.responsibility, this);
    this.components.metadata = new MetadataComponent(containers.metadata, this);
    this.components.controls = new GraphControlsComponent(containers.controls, this);
    this.components.entries = new EntriesComponent(containers.entries, this);

    // Render all components
    this.components.tagline.render({ tagline: this.itemDetails.tagline });
    this.components.status.render({ statuses: this.allowedStatuses, currentStatus: this.itemDetails.status });
    this.components.monitoring.render({ monitors: this.itemDetails.monitors, currentUser: this.itemDetails.currentUser });
    this.components.visibility.render({ ignored: this.itemDetails.ignored });
    this.components.responsibility.render({ takenBy: this.itemDetails.takenBy, currentUser: this.itemDetails.currentUser });
    this.components.metadata.render({ created: this.itemDetails.created, person: this.itemDetails.person });
    this.components.controls.render({});
    this.components.entries.render({ entries: this.itemDetails.entries });

    // Initial state is clean
    this.transitionToState('clean');
  }

  updateComponents() {
    // Update all components with new data (preserving user edits)
    this.headerIdElement.textContent = this.itemDetails.itemId;

    if (this.components.tagline) {
      this.components.tagline.update({ tagline: this.itemDetails.tagline });
    }
    if (this.components.status) {
      this.components.status.update({ statuses: this.allowedStatuses, currentStatus: this.itemDetails.status });
    }
    if (this.components.monitoring) {
      this.components.monitoring.update({ monitors: this.itemDetails.monitors, currentUser: this.itemDetails.currentUser });
    }
    if (this.components.visibility) {
      this.components.visibility.update({ ignored: this.itemDetails.ignored });
    }
    if (this.components.responsibility) {
      this.components.responsibility.update({ takenBy: this.itemDetails.takenBy, currentUser: this.itemDetails.currentUser });
    }
    if (this.components.entries) {
      this.components.entries.update({ entries: this.itemDetails.entries });
    }
  }

  notifyStatusCallbacks() {
    this.statusUpdateCallbacks.forEach(cb => cb());
  }

  async copyItemId() {
    try {
      await navigator.clipboard.writeText(this.itemId);
      showToast('Item ID copied to clipboard');
    } catch (error) {
      console.error('Failed to copy item ID:', error);
      showToast('Failed to copy item ID', 'error');
    }
  }
}

/**
 * Open item editor
 * @param {string} itemId - The item ID to edit
 * @returns {ItemEditorModal} The modal instance
 */
export async function openItemEditor(itemId) {
  const instance = new ItemEditorModal(itemId);
  instance.show();
  return instance;
}

/**
 * Legacy initialization function
 */
export function initializeItemEditor() {
  // No-op: initialization is now handled per-instance
}

/**
 * Register status update callback
 */
export function onItemStatusUpdate(callback) {
  // This is a legacy API - we'll need to track this globally
  // For now, just store it on window
  if (!window._itemEditorStatusCallbacks) {
    window._itemEditorStatusCallbacks = [];
  }
  window._itemEditorStatusCallbacks.push(callback);
}

/**
 * Helper functions
 */
function showToast(message, type = 'success') {
  if (window.showToast) {
    window.showToast(message, type);
  }
}

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Global function to dispatch escape behavior
 */
window.dispatchModalEscape = function() {
  const escapeEvent = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(escapeEvent);
};

/**
 * Inject minimal item-editor-specific CSS styles (once)
 * Most styles come from sparkle-base.css
 */
function injectItemEditorStyles() {
  if (document.getElementById('itemEditorStyles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'itemEditorStyles';
  style.textContent = `
    /* Item Editor Specific Styles */

    /* Header ID badge styling */
    .item-editor-header-id {
      font-family: monospace;
      background: var(--bg-tertiary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 14px;
      margin-left: 8px;
      cursor: pointer;
      color: var(--text-secondary);
    }

    .item-editor-header-id:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    /* Tagline input specific styling */
    .item-tagline-input {
      flex: 1;
      min-width: 0;
    }

    /* Entry textarea specific styling */
    .item-new-entry-text {
      width: 100%;
      min-height: 80px;
      resize: vertical;
    }

    /* Status select specific width */
    .item-status-select {
      max-width: 200px;
    }
  `;
  document.head.appendChild(style);
}
