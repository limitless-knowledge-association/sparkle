/**
 * Sparkle Modal Stack Manager
 * Manages stacking of multiple modal instances with proper z-ordering
 */

/**
 * Global modal stack instance
 */
class ModalStack {
  constructor() {
    this.stack = []; // Array of modal instances (bottom to top)
    this.baseZIndex = 10000;
    this.setupGlobalHandlers();
  }

  /**
   * Push a new modal onto the stack
   * @param {StackableModal} modalInstance - The modal instance to add
   * @returns {StackableModal} The modal instance
   */
  push(modalInstance) {
    const zIndex = this.baseZIndex + this.stack.length * 2; // *2 to leave room for overlay
    modalInstance.setZIndex(zIndex);
    this.stack.push(modalInstance);
    this.updateOverlays();
    return modalInstance;
  }

  /**
   * Remove and destroy the topmost modal
   * @returns {StackableModal|null} The removed modal
   */
  pop() {
    if (this.stack.length === 0) return null;

    const modal = this.stack.pop();
    if (modal) {
      modal.destroy();
    }
    this.updateOverlays();
    return modal;
  }

  /**
   * Remove a specific modal from the stack
   * @param {StackableModal} modalInstance - The modal to remove
   */
  remove(modalInstance) {
    const index = this.stack.indexOf(modalInstance);
    if (index !== -1) {
      this.stack.splice(index, 1);
      modalInstance.destroy();
      this.updateOverlays();
      this.reindexStack();
    }
  }

  /**
   * Get the topmost modal
   * @returns {StackableModal|null}
   */
  getTop() {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  /**
   * Get the number of modals in the stack
   * @returns {number}
   */
  getDepth() {
    return this.stack.length;
  }

  /**
   * Update overlay visibility - only the topmost modal shows its overlay
   */
  updateOverlays() {
    this.stack.forEach((modal, index) => {
      const isTop = index === this.stack.length - 1;
      modal.setOverlayVisible(isTop);
    });
  }

  /**
   * Reassign z-indexes after a modal is removed from the middle
   */
  reindexStack() {
    this.stack.forEach((modal, index) => {
      const zIndex = this.baseZIndex + index * 2;
      modal.setZIndex(zIndex);
    });
  }

  /**
   * Close all modals (e.g., on server disconnect)
   */
  closeAll() {
    console.log(`Closing all modals (${this.stack.length} open)`);
    // Close from top to bottom
    while (this.stack.length > 0) {
      this.pop();
    }
  }

  /**
   * Setup global event handlers
   */
  setupGlobalHandlers() {
    // ESC key - routes to topmost modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const topModal = this.getTop();
        if (topModal && topModal.handleEscape) {
          e.preventDefault();
          e.stopPropagation();
          topModal.handleEscape();
        }
      }
    });

    // Subscribe to server disconnect events - close all modals
    // Import subscribeToEvent dynamically to avoid circular dependency
    import('./sparkle-common.js').then(({ subscribeToEvent }) => {
      subscribeToEvent('serverDisconnected', () => {
        console.log('Server disconnected - closing all modals');
        this.closeAll();
      });
    }).catch(error => {
      console.warn('Could not subscribe to serverDisconnected event:', error);
    });
  }

  /**
   * Play a beep sound (for clicking outside)
   */
  beep() {
    // Use the Web Audio API to generate a beep
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Frequency in Hz
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.warn('Could not play beep sound:', error);
    }
  }
}

/**
 * Base class for stackable modals
 */
export class StackableModal {
  constructor(type) {
    this.id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = type;
    this.element = null;
    this.overlayElement = null;
    this.state = {}; // Modal-specific state
    this.eventUnsubscribers = []; // Array of cleanup functions
  }

  /**
   * Set the z-index for this modal
   * @param {number} z - The z-index value
   */
  setZIndex(z) {
    if (this.overlayElement) {
      this.overlayElement.style.zIndex = z;
    }
    if (this.element) {
      this.element.style.zIndex = z + 1; // Content is above overlay
    }
  }

  /**
   * Set overlay visibility
   * @param {boolean} visible - Whether the overlay should be visible
   */
  setOverlayVisible(visible) {
    if (this.overlayElement) {
      this.overlayElement.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Destroy this modal instance
   * Removes DOM elements and cleans up event listeners
   */
  destroy() {
    // Unsubscribe from all events
    this.eventUnsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch (error) {
        console.error('Error unsubscribing:', error);
      }
    });
    this.eventUnsubscribers = [];

    // Remove DOM elements
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    if (this.overlayElement) {
      this.overlayElement.remove();
      this.overlayElement = null;
    }
  }

  /**
   * Handle escape key press
   * Override in subclasses
   */
  handleEscape() {
    // Default: close the modal
    this.close();
  }

  /**
   * Close this modal (remove from stack)
   */
  close() {
    modalStack.remove(this);
  }

  /**
   * Show this modal
   */
  show() {
    if (this.element) {
      this.element.classList.add('show');
    }
  }

  /**
   * Hide this modal (without destroying)
   */
  hide() {
    if (this.element) {
      this.element.classList.remove('show');
    }
  }
}

// Create global modal stack instance
export const modalStack = new ModalStack();

// Make it available globally for debugging
window.modalStack = modalStack;
