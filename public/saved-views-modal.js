/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Saved Views modals — name the current view, and manage (open/delete) existing ones.
 */

import { modalStack } from './modal-stack.js';
import { listViews, saveCurrentView, deleteView, goToView, currentPage } from './savedViews.js';
import { refreshViewSelector, showToast } from './sparkle-common.js';

/** Shared modal scaffolding so both dialogs stack and dismiss consistently. */
class BaseViewsModal {
  constructor(titleText) {
    this.id = `savedViewsModal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    injectSavedViewsStyles();

    document.body.insertAdjacentHTML('beforeend', `
      <div id="${this.id}" class="sparkle-modal">
        <div class="sparkle-modal-overlay"></div>
        <div class="sparkle-modal-content">
          <div class="sparkle-modal-header">
            <h3>${titleText}</h3>
            <button class="sparkle-modal-close">&times;</button>
          </div>
          <div class="sparkle-modal-body saved-views-body"></div>
        </div>
      </div>
    `);

    this.element = document.getElementById(this.id);
    this.overlayElement = this.element.querySelector('.sparkle-modal-overlay');
    this.bodyElement = this.element.querySelector('.saved-views-body');

    this.element.querySelector('.sparkle-modal-close')
      .addEventListener('click', () => this.close());
    this.overlayElement.addEventListener('click', () => modalStack.beep());
  }

  show() {
    this.element.classList.add('show');
    modalStack.push(this);
  }

  close() {
    modalStack.remove(this);
  }

  handleEscape() {
    this.close();
  }

  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    this.overlayElement = null;
    this.bodyElement = null;
  }

  setZIndex(z) {
    if (this.overlayElement) this.overlayElement.style.zIndex = z;
    const content = this.element?.querySelector('.sparkle-modal-content');
    if (content) content.style.zIndex = z + 1;
  }

  setOverlayVisible(visible) {
    if (this.overlayElement) this.overlayElement.style.opacity = visible ? '1' : '0';
  }
}

/** "Save current view as…" */
class SaveViewModal extends BaseViewsModal {
  constructor() {
    super('Save Current View');
    this.render();
  }

  async render() {
    const existing = await listViews();
    const onThisPage = existing.filter(v => v.page === currentPage());

    this.bodyElement.innerHTML = `
      <p class="saved-views-help">
        Saves the filters, search text and sort order currently on screen, under a name you
        choose. Saved views are stored with this repository (never committed to git) and
        appear in the view dropdown.
      </p>
      <label class="saved-views-label" for="${this.id}-name">View name</label>
      <input id="${this.id}-name" class="saved-views-input" type="text" maxlength="60"
             placeholder="e.g. My blocked items" autocomplete="off">
      <div class="saved-views-existing">
        ${onThisPage.length > 0
          ? `Existing on this page: ${onThisPage.map(v => escapeHtml(v.name)).join(', ')}`
          : 'No saved views for this page yet.'}
      </div>
      <div class="saved-views-error" hidden></div>
      <div class="saved-views-actions">
        <button class="btn-secondary saved-views-cancel">Cancel</button>
        <button class="btn-primary saved-views-save">Save</button>
      </div>
    `;

    const input = this.bodyElement.querySelector('.saved-views-input');
    const errorEl = this.bodyElement.querySelector('.saved-views-error');

    const submit = async () => {
      const name = input.value.trim();
      if (!name) {
        errorEl.textContent = 'Please enter a name.';
        errorEl.hidden = false;
        input.focus();
        return;
      }

      // Overwriting is allowed but must be deliberate, so confirm rather than silently
      // replacing someone's saved view.
      const clash = existing.find(v => v.name.toLowerCase() === name.toLowerCase());
      if (clash && !window.confirm(`A view named "${clash.name}" already exists. Replace it?`)) {
        return;
      }

      try {
        await saveCurrentView(name);
        await refreshViewSelector();
        showToast(`Saved view "${name}"`, 'success');
        this.close();
      } catch (error) {
        errorEl.textContent = error.message || 'Failed to save view.';
        errorEl.hidden = false;
      }
    };

    this.bodyElement.querySelector('.saved-views-save').addEventListener('click', submit);
    this.bodyElement.querySelector('.saved-views-cancel')
      .addEventListener('click', () => this.close());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    input.focus();
  }
}

/** "Manage saved views…" — open or delete. */
class ManageViewsModal extends BaseViewsModal {
  constructor() {
    super('Manage Saved Views');
    this.render();
  }

  async render() {
    const views = await listViews();

    if (views.length === 0) {
      this.bodyElement.innerHTML = `
        <p class="saved-views-help">No saved views yet. Use “Save current view as…” in the
        view dropdown to create one.</p>
        <div class="saved-views-actions">
          <button class="btn-secondary saved-views-cancel">Close</button>
        </div>
      `;
      this.bodyElement.querySelector('.saved-views-cancel')
        .addEventListener('click', () => this.close());
      return;
    }

    this.bodyElement.innerHTML = `
      <p class="saved-views-help">
        Stored with this repository, never committed to git. Bookmark a view's page to
        return to it directly — bookmarks survive a daemon restart only if a fixed port is
        configured.
      </p>
      <ul class="saved-views-list">
        ${views.map((v, i) => `
          <li class="saved-views-item">
            <div class="saved-views-item-main">
              <span class="saved-views-item-name">${escapeHtml(v.name)}</span>
              <span class="saved-views-item-page">${escapeHtml(v.page)}</span>
            </div>
            <div class="saved-views-item-actions">
              <button class="btn-secondary saved-views-open" data-index="${i}">Open</button>
              <button class="btn-secondary saved-views-delete" data-index="${i}">Delete</button>
            </div>
          </li>
        `).join('')}
      </ul>
      <div class="saved-views-actions">
        <button class="btn-secondary saved-views-cancel">Close</button>
      </div>
    `;

    this.bodyElement.querySelectorAll('.saved-views-open').forEach(btn => {
      btn.addEventListener('click', () => goToView(views[Number(btn.dataset.index)]));
    });

    this.bodyElement.querySelectorAll('.saved-views-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const view = views[Number(btn.dataset.index)];
        if (!window.confirm(`Delete saved view "${view.name}"?`)) {
          return;
        }
        try {
          await deleteView(view.name);
          await refreshViewSelector();
          showToast(`Deleted view "${view.name}"`, 'success');
          this.render(); // re-render in place so the list reflects the deletion
        } catch (error) {
          showToast(error.message || 'Failed to delete view', 'error');
        }
      });
    });

    this.bodyElement.querySelector('.saved-views-cancel')
      .addEventListener('click', () => this.close());
  }
}

export function openSaveViewModal() {
  new SaveViewModal().show();
}

export function openManageViewsModal() {
  new ManageViewsModal().show();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function injectSavedViewsStyles() {
  if (document.getElementById('savedViewsStyles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'savedViewsStyles';
  style.textContent = `
    .saved-views-body { padding: 16px; }

    .saved-views-help {
      color: var(--text-secondary);
      font-size: 13px;
      margin: 0 0 12px 0;
      line-height: 1.5;
    }

    .saved-views-label {
      display: block;
      font-size: 13px;
      margin-bottom: 6px;
      color: var(--text-secondary);
    }

    .saved-views-input {
      width: 100%;
      padding: 8px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 14px;
      box-sizing: border-box;
    }

    .saved-views-existing {
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .saved-views-error {
      margin-top: 8px;
      font-size: 13px;
      color: #f87171;
    }

    .saved-views-list {
      list-style: none;
      margin: 0 0 12px 0;
      padding: 0;
      max-height: 320px;
      overflow-y: auto;
    }

    .saved-views-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px;
      border-bottom: 1px solid var(--border-color);
    }

    .saved-views-item-main { display: flex; flex-direction: column; min-width: 0; }

    .saved-views-item-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .saved-views-item-page {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: monospace;
    }

    .saved-views-item-actions { display: flex; gap: 6px; flex-shrink: 0; }

    .saved-views-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
  `;
  document.head.appendChild(style);
}
