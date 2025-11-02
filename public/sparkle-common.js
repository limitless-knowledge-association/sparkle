/**
 * Sparkle Common UI Library
 * Shared functionality for all Sparkle web pages
 */

import { HEARTBEAT_TIMEOUT_MS } from '../src/heartbeat-config.js';
import { GitStatus } from './GitStatus.js';

// Server connection state
let isServerConnected = true;
let eventSource = null;
let heartbeatTimeoutId = null;
let serverInfo = null; // {version, hasFixedPort, port}
let reconnectionAttemptId = null;
let initialVersion = null; // Version when page first loaded
let portChangeInProgress = false; // Set to true when port configuration changes

// Observer pattern: subscribers for SSE events
// Map of eventName -> Set of callback functions
const eventSubscribers = new Map();

// Debug: Log module initialization to detect if loaded multiple times
const moduleInstanceId = `sparkle-common-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
console.log(`[sparkle-common] Module initialized with ID: ${moduleInstanceId}`);

// Global git status instance
const gitStatus = new GitStatus();
window.gitStatus = gitStatus; // Make available for debugging

/**
 * Notify that port configuration is changing
 * Called by ConfigurationSettings when port is changed
 */
export function notifyPortChange() {
  portChangeInProgress = true;
  console.log('Port change detected - reconnection will be disabled');
}

/**
 * Subscribe to an SSE event
 * Components can subscribe to events without knowing about SSE internals
 * @param {string} eventName - Name of the SSE event (e.g., 'dataUpdated', 'statusesUpdated')
 * @param {Function} callback - Callback function(event) to invoke when event fires
 * @returns {Function} Unsubscribe function
 */
export function subscribeToEvent(eventName, callback) {
  if (!eventSubscribers.has(eventName)) {
    eventSubscribers.set(eventName, new Set());
  }

  eventSubscribers.get(eventName).add(callback);
  console.log(`Subscriber added for event: ${eventName}, total: ${eventSubscribers.get(eventName).size}`);

  // Debug: Show Map state after adding subscriber
  if (eventName === 'configurationUpdated') {
    console.log(`[subscribeToEvent] Module ID: ${moduleInstanceId}`);
    console.log('[subscribeToEvent] Added configurationUpdated subscriber');
    console.log('[subscribeToEvent] Map keys after add:', Array.from(eventSubscribers.keys()));
    console.log('[subscribeToEvent] Map size:', eventSubscribers.size);
    console.log('[subscribeToEvent] configurationUpdated Set size:', eventSubscribers.get('configurationUpdated').size);
    console.trace('[subscribeToEvent] Stack trace for configurationUpdated subscription');
  }

  // Return unsubscribe function
  return () => {
    const subscribers = eventSubscribers.get(eventName);
    if (subscribers) {
      subscribers.delete(callback);
      console.log(`Subscriber removed for event: ${eventName}, remaining: ${subscribers.size}`);
      if (eventName === 'configurationUpdated') {
        console.trace('[unsubscribe] Stack trace for configurationUpdated unsubscribe');
      }
    }
  };
}

/**
 * Publish an SSE event to all subscribers
 * @param {string} eventName - Name of the event
 * @param {Event} event - The SSE event object
 */
function publishEvent(eventName, event) {
  const subscribers = eventSubscribers.get(eventName);

  // Only log detailed debug info for configurationUpdated
  if (eventName === 'configurationUpdated') {
    console.log(`[publishEvent] Module ID: ${moduleInstanceId}`);
    console.log(`[publishEvent] Event: ${eventName}`);
    console.log(`[publishEvent] eventSubscribers Map has ${eventSubscribers.size} event types`);
    console.log(`[publishEvent] eventSubscribers keys:`, Array.from(eventSubscribers.keys()));
    console.log(`[publishEvent] Subscribers for ${eventName}:`, subscribers ? subscribers.size : 0);
  }

  if (subscribers && subscribers.size > 0) {
    subscribers.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error(`Error in subscriber for ${eventName}:`, error);
      }
    });
  } else if (eventName === 'configurationUpdated') {
    console.log(`[publishEvent] No subscribers for event: ${eventName}`);
  }
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'success' or 'error'
 */
export function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === 'error' ? '#ef4444' : '#4ade80'};
    color: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10001;
    opacity: 0;
    transform: translateX(400px);
    transition: all 0.3s;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  }, 10);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(400px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Show rebuild progress overlay
 * @param {number} current - Current item number being rebuilt
 * @param {number} total - Total number of items to rebuild
 * @param {string} reason - Reason for rebuild (e.g., 'corruption_detected', 'git_pull')
 */
export function showRebuildProgress(current, total, reason) {
  // Remove existing overlay if present
  const existing = document.getElementById('rebuildOverlay');
  if (existing) {
    existing.remove();
  }

  // Create overlay HTML
  const overlay = document.createElement('div');
  overlay.id = 'rebuildOverlay';
  overlay.innerHTML = `
    <div class="rebuild-overlay-backdrop">
      <div class="rebuild-overlay-content">
        <h2>Rebuilding Data Store</h2>
        <p class="rebuild-reason">${formatRebuildReason(reason)}</p>
        <div class="rebuild-progress-container">
          <div class="rebuild-progress-bar">
            <div class="rebuild-progress-fill" id="rebuildProgressFill" style="width: 0%"></div>
          </div>
          <div class="rebuild-progress-text" id="rebuildProgressText">0 / ${total} items</div>
        </div>
        <p class="rebuild-note">Please wait while we rebuild the data store...</p>
      </div>
    </div>
  `;

  // Add styles
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10000;
  `;

  // Add to document
  document.body.appendChild(overlay);

  // Add CSS if not already present
  if (!document.getElementById('rebuildProgressStyles')) {
    const styles = document.createElement('style');
    styles.id = 'rebuildProgressStyles';
    styles.textContent = `
      .rebuild-overlay-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s;
      }

      .rebuild-overlay-content {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 30px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      }

      .rebuild-overlay-content h2 {
        margin: 0 0 10px 0;
        color: #fff;
        font-size: 24px;
      }

      .rebuild-reason {
        color: #aaa;
        margin: 0 0 20px 0;
        font-size: 14px;
      }

      .rebuild-progress-container {
        margin: 20px 0;
      }

      .rebuild-progress-bar {
        width: 100%;
        height: 24px;
        background: #333;
        border-radius: 12px;
        overflow: hidden;
        margin-bottom: 10px;
      }

      .rebuild-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4ade80, #22c55e);
        transition: width 0.3s ease;
        border-radius: 12px;
      }

      .rebuild-progress-text {
        text-align: center;
        color: #fff;
        font-size: 16px;
        font-weight: 500;
      }

      .rebuild-note {
        color: #aaa;
        margin: 20px 0 0 0;
        font-size: 14px;
        text-align: center;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(styles);
  }
}

/**
 * Update rebuild progress
 * @param {number} current - Current item number being rebuilt
 * @param {number} total - Total number of items to rebuild
 * @param {number} percentage - Percentage complete
 */
export function updateRebuildProgress(current, total, percentage) {
  const fill = document.getElementById('rebuildProgressFill');
  const text = document.getElementById('rebuildProgressText');

  if (fill) {
    fill.style.width = `${percentage}%`;
  }

  if (text) {
    text.textContent = `${current} / ${total} items (${percentage}%)`;
  }
}

/**
 * Hide rebuild progress overlay
 */
export function hideRebuildProgress() {
  const overlay = document.getElementById('rebuildOverlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
  }
}

/**
 * Format rebuild reason for display
 * @param {string} reason - Reason code
 * @returns {string} Human-readable reason
 */
function formatRebuildReason(reason) {
  const reasons = {
    'corruption_detected': 'Data corruption detected - rebuilding from events',
    'git_pull': 'Changes detected from git pull - updating affected items',
    'manual': 'Manual rebuild requested',
    'initialization': 'First-time initialization'
  };
  return reasons[reason] || 'Rebuilding data store';
}

/**
 * Initialize the common header with status bar and navigation
 * @param {Object} options - Configuration options
 * @param {string|null} options.navigationLink - DEPRECATED: Use usePrimaryViewsDropdown instead
 * @param {boolean} options.usePrimaryViewsDropdown - If true, shows dropdown of primary views (default: false)
 * @param {Function} options.onServerConnected - Callback when server reconnects
 * @param {Function} options.onServerDisconnected - Callback when server disconnects
 */
export function initializeHeader(options = {}) {
  const { navigationLink = null, usePrimaryViewsDropdown = false, onServerConnected = null, onServerDisconnected = null } = options;

  // Build controls HTML for right side
  let controlsHTML = '';
  if (usePrimaryViewsDropdown) {
    controlsHTML = `
      <div class="header-controls">
        <select id="viewSelector" class="view-selector">
          <option value="">Switch View...</option>
        </select>
        <button id="newWindowBtn" class="header-btn" onclick="window.openNewWindow()" title="Open new window">New Window</button>
        <button id="createItemBtn" class="header-btn" onclick="window.openCreateItemModal()" title="Create new item">Create Item</button>
        <button id="configBtn" class="header-btn" onclick="window.openConfigurationModal()" title="Configuration">Configuration</button>
      </div>
    `;
  } else if (navigationLink) {
    // Legacy support for old-style navigation links
    controlsHTML = `<a href="${navigationLink.url}" class="nav-link">${navigationLink.text}</a>`;
  }

  // Create header HTML with two-line layout
  const headerHTML = `
    <div class="sparkle-header">
      <h1 class="sparkle-title">✨ Sparkle <span id="sparkleVersion" style="font-size: 0.5em; font-weight: normal;">-</span></h1>
      <div class="status-bar">
        <div class="git-info">
          <div class="git-lines">
            <div class="git-line-1">
              <span id="gitStatus" title="Git status will appear here">Git: <span id="gitStatusText">active</span></span>
              <span id="lastUpdate" style="margin-left: 1em; display: inline-block; min-width: 150px;">Updated: -</span>
            </div>
            <div class="git-line-2">
              <span><span id="rootDirectory">-</span> / <span id="branchName">-</span></span>
              <span id="nextUpdate" class="next-update-text" style="margin-left: 1em; display: inline-block; min-width: 150px;">Update: -</span>
            </div>
          </div>
          <button id="updateNowBtn" class="update-now-btn" title="Click to fetch updates now">Update Now</button>
        </div>
        ${controlsHTML}
      </div>
    </div>
  `;

  // Create disconnection overlay HTML
  const overlayHTML = `
    <div id="disconnectionOverlay" class="disconnection-overlay">
      <div class="disconnection-message">
        <h2>⚠️ Server Disconnected</h2>
        <p>The Sparkle daemon has stopped responding.</p>
        <p id="disconnectionAction">Re-start the Sparkle daemon. Close this window. The new daemon will open a new window.</p>
      </div>
    </div>
  `;

  // Insert header at the beginning of body
  document.body.insertAdjacentHTML('afterbegin', headerHTML);

  // Insert overlay at the end of body
  document.body.insertAdjacentHTML('beforeend', overlayHTML);

  // If using primary views dropdown, populate it
  if (usePrimaryViewsDropdown) {
    populatePrimaryViewsDropdown();
  }

  // Store callbacks
  window.sparkleCallbacks = {
    onServerConnected,
    onServerDisconnected
  };

  // Load server info (version, fixed port status)
  loadServerInfo();

  // Add global function to open new window
  window.openNewWindow = function() {
    // Open list_view.html (default page) in a new independent window
    const width = 1200;
    const height = 800;
    const left = window.screenX + 50;
    const top = window.screenY + 50;
    window.open(
      'list_view.html',
      '_blank',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );
  };

  // Add click handler for Update Now button to trigger fetch
  const updateNowBtn = document.getElementById('updateNowBtn');
  if (updateNowBtn) {
    updateNowBtn.addEventListener('click', async () => {
      try {
        const result = await apiCall('/api/fetch', {});
        if (result.success) {
          if (result.message === 'Fetch already in progress') {
            showToast('Fetch already in progress');
          } else {
            showToast('Update started');
          }
        } else {
          showToast('Update request failed', 'error');
        }
      } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
      }
    });
  }
}

/**
 * Populate the primary views dropdown
 * Loads primaryViews.js and populates the dropdown with available views
 */
async function populatePrimaryViewsDropdown() {
  try {
    // Dynamically import the generated primaryViews.js
    const { primaryViews } = await import('./primaryViews.js');

    const selector = document.getElementById('viewSelector');
    if (!selector) return;

    // Get current page filename for highlighting
    const currentPage = window.location.pathname.split('/').pop();

    // Clear existing options except the first one
    selector.innerHTML = '<option value="">Switch View...</option>';

    // Add all primary views
    for (const view of primaryViews) {
      const option = document.createElement('option');
      option.value = view.url;
      option.textContent = view.name;

      // Disable current view but don't mark it as "(current)"
      if (view.url === currentPage) {
        option.disabled = true;
        option.selected = true;
      }

      selector.appendChild(option);
    }

    // Handle selection changes
    selector.addEventListener('change', (e) => {
      const selectedUrl = e.target.value;
      if (selectedUrl) {
        window.location.href = selectedUrl;
      }
    });

  } catch (error) {
    console.error('Failed to load primary views:', error);
    // If primaryViews.js doesn't exist yet, show a helpful message
    const selector = document.getElementById('viewSelector');
    if (selector) {
      selector.innerHTML = '<option value="">No views available</option>';
      selector.disabled = true;
    }
  }
}

/**
 * Reset the heartbeat timeout
 */
function resetHeartbeatTimeout() {
  if (heartbeatTimeoutId) {
    clearTimeout(heartbeatTimeoutId);
  }

  heartbeatTimeoutId = setTimeout(() => {
    console.error(`Heartbeat timeout - no heartbeat received for ${HEARTBEAT_TIMEOUT_MS / 1000} seconds`);
    handleServerDisconnected();
  }, HEARTBEAT_TIMEOUT_MS);
}

/**
 * Clear the heartbeat timeout
 */
function clearHeartbeatTimeout() {
  if (heartbeatTimeoutId) {
    clearTimeout(heartbeatTimeoutId);
    heartbeatTimeoutId = null;
  }
}

/**
 * Connect to server SSE stream
 * @param {Object} eventHandlers - DEPRECATED: Map of event names to handler functions (use subscribeToEvent instead)
 */
export function connectToServer(eventHandlers = {}) {
  if (eventSource) {
    eventSource.close();
  }

  // Start heartbeat timeout
  resetHeartbeatTimeout();

  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('connected', function(e) {
    console.log('SSE connected');
    handleServerConnected();
  });

  eventSource.addEventListener('heartbeat', function(e) {
    // Server is alive - reset the heartbeat timeout
    resetHeartbeatTimeout();

    if (!isServerConnected) {
      handleServerConnected();
    }
  });

  // Note: gitStatus SSE events are now handled by GitStatus class
  // The event is still published to subscribers for backward compatibility
  eventSource.addEventListener('gitStatus', function(e) {
    publishEvent('gitStatus', e);
  });

  // Handle countdown to next fetch
  eventSource.addEventListener('countdown', function(e) {
    const data = JSON.parse(e.data);
    document.getElementById('nextUpdate').textContent = `Update: ${data.countdown}`;
    // Also publish to subscribers
    publishEvent('countdown', e);
  });

  // Handle fetch status updates
  eventSource.addEventListener('fetchStatus', function(e) {
    const data = JSON.parse(e.data);
    updateFetchStatusDisplay(data.inProgress);
    // Also publish to subscribers
    publishEvent('fetchStatus', e);
  });

  // Handle dataUpdated events - publish to all subscribers
  eventSource.addEventListener('dataUpdated', function(e) {
    console.log('SSE dataUpdated received, publishing to subscribers');
    publishEvent('dataUpdated', e);
  });

  // Handle statusesUpdated events - publish to all subscribers
  eventSource.addEventListener('statusesUpdated', function(e) {
    console.log('SSE statusesUpdated received, publishing to subscribers');
    publishEvent('statusesUpdated', e);
  });

  // Handle configurationUpdated events - publish to all subscribers
  eventSource.addEventListener('configurationUpdated', function(e) {
    console.log('SSE configurationUpdated received, publishing to subscribers');
    publishEvent('configurationUpdated', e);
  });

  // Handle portChanging events - daemon is shutting down due to port change
  eventSource.addEventListener('portChanging', function(e) {
    console.log('SSE portChanging received - daemon shutting down for port change');
    const data = JSON.parse(e.data);
    console.log('Port changing from', data.oldPort, 'to', data.newPort);
    portChangeInProgress = true;
  });

  // Handle aggregate update events
  eventSource.addEventListener('aggregatesUpdated', function(e) {
    console.log('SSE aggregatesUpdated received, publishing to subscribers');
    publishEvent('aggregatesUpdated', e);
  });

  // Handle rebuild events
  eventSource.addEventListener('rebuildStarted', function(e) {
    const data = JSON.parse(e.data);
    console.log('SSE rebuildStarted received:', data);
    showRebuildProgress(0, data.total, data.reason);
    publishEvent('rebuildStarted', e);
  });

  eventSource.addEventListener('rebuildProgress', function(e) {
    const data = JSON.parse(e.data);
    updateRebuildProgress(data.current, data.total, data.percentage);
    publishEvent('rebuildProgress', e);
  });

  eventSource.addEventListener('rebuildCompleted', function(e) {
    const data = JSON.parse(e.data);
    console.log('SSE rebuildCompleted received:', data);
    hideRebuildProgress();
    showToast(`Data store rebuilt (${data.total} items in ${data.duration}ms)`, 'success');
    publishEvent('rebuildCompleted', e);
  });

  eventSource.addEventListener('rebuildFailed', function(e) {
    const data = JSON.parse(e.data);
    console.error('SSE rebuildFailed received:', data);
    hideRebuildProgress();
    showToast(`Rebuild failed: ${data.error}`, 'error');
    publishEvent('rebuildFailed', e);
  });

  // DEPRECATED: Still support old eventHandlers for backward compatibility
  // But prefer using subscribeToEvent instead
  for (const [eventName, handler] of Object.entries(eventHandlers)) {
    console.warn(`DEPRECATED: Using eventHandlers in connectToServer(). Use subscribeToEvent('${eventName}', callback) instead.`);
    eventSource.addEventListener(eventName, handler);
  }

  eventSource.onerror = function(e) {
    console.error('SSE error', e);
    handleServerDisconnected();
  };
}

/**
 * Update git status display from GitStatus observer
 * @param {Object} status - Status object from GitStatus.getStatus()
 */
function updateGitStatusDisplay(status) {
  const gitStatusText = document.getElementById('gitStatusText');
  const gitStatusContainer = document.getElementById('gitStatus');

  if (gitStatusText) {
    gitStatusText.textContent = status.displayText;

    if (status.active) {
      gitStatusText.style.color = '#4ade80'; // green
    } else {
      gitStatusText.style.color = '#fbbf24'; // yellow/warning
    }
  }

  // Set tooltip on container
  if (gitStatusContainer) {
    gitStatusContainer.title = status.tooltipText;
  }
}

/**
 * Update fetch status display
 */
function updateFetchStatusDisplay(inProgress) {
  const nextUpdate = document.getElementById('nextUpdate');
  const updateNowBtn = document.getElementById('updateNowBtn');

  if (nextUpdate) {
    if (inProgress) {
      nextUpdate.textContent = 'Update: Updating...';
      nextUpdate.style.color = '#fbbf24';
      nextUpdate.style.fontWeight = 'bold';
    } else {
      nextUpdate.style.color = '';
      nextUpdate.style.fontWeight = '';
      // The countdown will be updated by the SSE countdown event
    }
  }

  if (updateNowBtn) {
    updateNowBtn.disabled = inProgress;
  }
}

/**
 * Handle server connection restored
 */
function handleServerConnected() {
  isServerConnected = true;

  // Restart heartbeat timeout since we're connected
  resetHeartbeatTimeout();

  // Hide overlay and re-enable page
  document.getElementById('disconnectionOverlay').classList.remove('show');
  document.body.classList.remove('page-disabled');

  // Call user callback if provided
  if (window.sparkleCallbacks?.onServerConnected) {
    window.sparkleCallbacks.onServerConnected();
  }
}

/**
 * Handle server disconnection
 */
function handleServerDisconnected() {
  if (isServerConnected) {
    isServerConnected = false;

    // Clear heartbeat timeout since we're disconnected
    clearHeartbeatTimeout();

    // Show overlay and disable page interaction
    document.getElementById('disconnectionOverlay').classList.add('show');
    document.body.classList.add('page-disabled');

    // Publish serverDisconnected event for modals to close
    publishEvent('serverDisconnected', { data: JSON.stringify({}) });

    // Call user callback if provided
    if (window.sparkleCallbacks?.onServerDisconnected) {
      window.sparkleCallbacks.onServerDisconnected();
    }

    // Check if this is due to port change
    if (portChangeInProgress) {
      // Port changed - don't attempt reconnection, show message
      const disconnectionAction = document.getElementById('disconnectionAction');
      if (disconnectionAction) {
        disconnectionAction.textContent = 'Daemon is restarting with new port. Please run "npx sparkle browser" to reconnect.';
      }
      console.log('Port change in progress - not attempting reconnection');
    } else if (serverInfo?.hasFixedPort) {
      // Normal disconnect with fixed port - attempt reconnection
      attemptReconnection();
    }
  }
}

/**
 * Attempt to reconnect to server (only for fixed port configurations)
 */
function attemptReconnection() {
  if (reconnectionAttemptId) {
    return; // Already attempting reconnection
  }

  console.log('Server disconnected with fixed port - will attempt reconnection...');
  const disconnectionAction = document.getElementById('disconnectionAction');
  if (disconnectionAction) {
    disconnectionAction.textContent = 'Server disconnected. Attempting to reconnect...';
  }

  // Try to reconnect every 2 seconds
  reconnectionAttemptId = setInterval(async () => {
    try {
      const response = await fetch('/api/serverInfo', {
        method: 'GET',
        cache: 'no-cache'
      });

      if (response.ok) {
        const newServerInfo = await response.json();
        console.log('Server reconnected!', newServerInfo);

        // Check if version changed during downtime
        if (initialVersion && newServerInfo.version !== initialVersion) {
          console.log(`Server version changed: ${initialVersion} → ${newServerInfo.version}. Reloading page...`);
          // Version changed - reload the page to get new code
          window.location.reload();
        } else {
          // Version same - just reconnect SSE
          clearInterval(reconnectionAttemptId);
          reconnectionAttemptId = null;
          serverInfo = newServerInfo;
          connectToServer();
        }
      }
    } catch (error) {
      // Server still down, will try again
      console.log('Reconnection attempt failed, will retry...');
    }
  }, 2000);
}

/**
 * Load server info (version, hasFixedPort, port)
 */
async function loadServerInfo() {
  try {
    const response = await fetch('/api/serverInfo');
    serverInfo = await response.json();

    // Store initial version for comparison later
    if (!initialVersion) {
      initialVersion = serverInfo.version;
    }

    console.log('Server info loaded:', serverInfo);
    return serverInfo;
  } catch (error) {
    console.error('Failed to load server info:', error);
    return null;
  }
}

/**
 * Load and display branch status in header
 */
export async function loadBranchStatus() {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();

    document.getElementById('branchName').textContent = status.branch;

    // Display root directory name
    if (status.rootDirectoryName) {
      document.getElementById('rootDirectory').textContent = status.rootDirectoryName;
    }

    // Note: Git status is now handled by GitStatus observer class
    // Connection status ("Connected"/"Disconnected") is handled by SSE connection handlers

    // Update last fetch time if available
    if (status.lastChangeTimestamp) {
      const date = new Date(status.lastChangeTimestamp);
      const lastUpdateEl = document.getElementById('lastUpdate');
      if (lastUpdateEl) {
        lastUpdateEl.textContent = `Updated: ${date.toLocaleTimeString()}`;
      }
    }

    return status;
  } catch (error) {
    console.error('Failed to load branch status:', error);
    return null;
  }
}

/**
 * Load and display Sparkle version in header
 */
export async function loadVersion() {
  try {
    const response = await fetch('/api/version');
    const data = await response.json();

    document.getElementById('sparkleVersion').textContent = `v${data.version}`;

    return data.version;
  } catch (error) {
    console.error('Failed to load version:', error);
    document.getElementById('sparkleVersion').textContent = 'error';
    return null;
  }
}

/**
 * Make API call with error handling
 */
export async function apiCall(endpoint, body = null) {
  const options = {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {}
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(endpoint, options);

  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Frontend logging system - batches logs and sends to backend after quiescence
 */
let frontendLogBatch = [];
let frontendLogQuiescenceTimer = null;
const FRONTEND_LOG_QUIESCENCE_MS = 5000; // 5 seconds of no new logs before sending

/**
 * Add a log entry to the batch
 * Automatically sends batch to backend after 5 seconds of quiescence
 * @param {string} message - Log message
 */
export function frontendLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [Frontend] ${message}`;

  frontendLogBatch.push(logEntry);

  // Reset quiescence timer
  if (frontendLogQuiescenceTimer) {
    clearTimeout(frontendLogQuiescenceTimer);
  }

  frontendLogQuiescenceTimer = setTimeout(async () => {
    // Send batch to backend
    if (frontendLogBatch.length > 0) {
      try {
        const batchToSend = [...frontendLogBatch];
        frontendLogBatch = []; // Clear batch immediately to avoid duplicates

        await apiCall('/log', { logs: batchToSend });
      } catch (error) {
        console.error('Failed to send frontend logs:', error);
      }
    }
  }, FRONTEND_LOG_QUIESCENCE_MS);
}

/**
 * Apply dark mode to the page
 * @param {boolean} enabled - Whether dark mode should be enabled
 */
export function applyDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

/**
 * Load configuration and apply dark mode
 * This should be called early in page initialization
 * @returns {Promise<Object>} The merged configuration
 */
export async function loadAndApplyConfig() {
  try {
    // Get localStorage config
    const localConfigStr = localStorage.getItem('sparkle.config');
    const localConfig = localConfigStr ? JSON.parse(localConfigStr) : null;

    // Get merged config from server (includes project + defaults)
    const response = await fetch('/api/config/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localConfig })
    });

    const data = await response.json();

    // Apply dark mode immediately
    applyDarkMode(data.merged.darkMode);

    return data;
  } catch (error) {
    console.error('Failed to load config:', error);
    // On error, use defaults
    return {
      defaults: { darkMode: false, filters: {} },
      project: { darkMode: null, filters: {} },
      merged: { darkMode: false, filters: {} }
    };
  }
}

/**
 * Common initialization for all primary views
 * Handles non-blocking status loading and performance logging
 * @param {Object} options - Configuration options
 * @param {Function} options.loadMainContent - Function to load the main view content (items, tree, etc.)
 * @param {string} options.viewName - Name of the view for logging
 * @returns {Promise<void>}
 */
export async function initializeView(options) {
  const { loadMainContent, viewName } = options;
  const initStartTime = Date.now();
  frontendLog(`${viewName} - init() START`);

  // Inject common CSS
  const cssStartTime = Date.now();
  document.getElementById('injected-common-css').textContent = getCommonCSS();
  frontendLog(`${viewName} - Injected CSS: ${Date.now() - cssStartTime}ms`);

  // Load and apply configuration (dark mode, filter defaults)
  const configStartTime = Date.now();
  const config = await loadAndApplyConfig();
  frontendLog(`${viewName} - Config loaded and applied: ${Date.now() - configStartTime}ms`);

  // Initialize GitStatus observer
  gitStatus.initialize();

  // Subscribe to git status changes
  gitStatus.onChange((status) => {
    updateGitStatusDisplay(status);
  });

  // Load branch status and version in background (non-blocking)
  // These update git/branch info which aren't needed for initial content display
  loadBranchStatus().then(() => frontendLog(`${viewName} - loadBranchStatus completed in background`));
  loadVersion().then(() => frontendLog(`${viewName} - loadVersion completed in background`));

  // Load main content (blocking - this is what users want to see first)
  const loadContentStartTime = Date.now();
  await loadMainContent();
  frontendLog(`${viewName} - Main content loaded: ${Date.now() - loadContentStartTime}ms`);

  frontendLog(`${viewName} - init() COMPLETE: ${Date.now() - initStartTime}ms`);

  return config;
}

/**
 * Get common CSS for Sparkle pages
 */
export function getCommonCSS() {
  return `
    body {
      margin: 0;
      padding-top: 0;
    }

    .sparkle-header {
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px 40px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      z-index: 1000;
    }

    .sparkle-title {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 600;
      text-align: center;
    }

    .status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      font-size: 14px;
    }

    .git-info {
      display: flex;
      gap: 12px;
      align-items: stretch;
    }

    .git-lines {
      display: flex;
      flex-direction: column;
      gap: 4px;
      justify-content: space-between;
    }

    .git-line-1, .git-line-2 {
      display: flex;
      align-items: center;
    }

    .header-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .header-btn {
      color: white;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.3);
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      outline: none;
      transition: all 0.2s;
      font-family: inherit;
      white-space: nowrap;
    }

    .header-btn:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: translateY(-1px);
    }

    .header-btn:active {
      transform: translateY(0);
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4ade80;
    }

    .status-indicator.warning {
      background: #fbbf24;
    }

    .nav-link {
      color: white;
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      transition: background 0.2s;
    }

    .nav-link:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .new-window-btn {
      color: white;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.3);
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      outline: none;
      transition: all 0.2s;
      margin-right: 10px;
      font-family: inherit;
    }

    .new-window-btn:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: translateY(-1px);
    }

    .new-window-btn:active {
      transform: translateY(0);
    }

    .view-selector {
      color: white;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.3);
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      outline: none;
      transition: all 0.2s;
      width: auto;
    }

    .view-selector:hover {
      background: rgba(255, 255, 255, 0.25);
    }

    .view-selector:focus {
      border-color: rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.2);
    }

    .view-selector option {
      background: #764ba2;
      color: white;
    }

    .view-selector option:disabled {
      color: #ccc;
    }

    .next-update-text {
      color: white;
      font-size: 14px;
      margin-left: 15px;
    }

    .update-now-btn {
      color: white;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      outline: none;
      transition: all 0.2s;
      font-family: inherit;
      white-space: nowrap;
      align-self: stretch;
    }

    .update-now-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
      transform: translateY(-1px);
    }

    .update-now-btn:active:not(:disabled) {
      transform: translateY(0);
      background: rgba(255, 255, 255, 0.25);
    }

    .update-now-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .disconnection-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    }

    .disconnection-overlay.show {
      display: flex;
    }

    .disconnection-message {
      background: white;
      padding: 40px;
      border-radius: 12px;
      text-align: center;
      max-width: 500px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .disconnection-message h2 {
      margin-top: 0;
      color: #f59e0b;
    }

    .reconnecting {
      margin-top: 20px;
      color: #667eea;
      font-weight: 500;
    }

    .page-disabled {
      pointer-events: none;
      opacity: 0.5;
    }
  `;
}
