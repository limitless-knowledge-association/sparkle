/**
 * AuditModel.js
 * Data model representing audit trail entries
 * Used by Monitor view, Audit Trail view, and any other audit displays
 */

/**
 * Represents a single audit trail entry with all its metadata
 */
export class AuditEntry {
  constructor(itemId, eventData, itemDetails = null) {
    this.itemId = itemId;
    this.isoTimestamp = eventData.timestamp;
    this.eventType = eventData.type;
    this.eventData = eventData; // Store full event object

    // Optional item details (used in Monitor view where multiple items shown)
    this.tagline = itemDetails?.tagline || null;
    this.status = itemDetails?.status || null;
    this.ignored = itemDetails?.ignored || false;
  }

  /**
   * Get timestamp as Date object for sorting
   */
  getDate() {
    return new Date(this.isoTimestamp);
  }

  /**
   * Create a unique key for this entry (for diffing)
   */
  getKey() {
    return `${this.itemId}:${this.isoTimestamp}`;
  }

  /**
   * Format event text (without timestamp)
   */
  formatEventText() {
    const event = this.eventData;
    const personName = event.person?.name || 'Unknown';

    switch (event.type) {
      case 'created':
        return `Item created by ${personName} with status "${event.status}"`;

      case 'tagline':
        return `Tagline changed to "${event.tagline}" by ${personName}`;

      case 'entry':
        const preview = event.text.substring(0, 40) + (event.text.length > 40 ? '...' : '');
        return `Entry added by ${personName}: "${preview}"`;

      case 'status':
        const statusText = event.text ? ` (${event.text})` : '';
        return `Status changed to "${event.status}" by ${personName}${statusText}`;

      case 'dependency':
        const relDisplay = event.relatedItemMissing
          ? `ERROR: OBJECT ID ${event.relatedItemId} MISSING`
          : `${event.relatedItemTagline} (${event.relatedItemId})`;

        if (event.reverse) {
          if (event.action === 'linked') {
            return `Dependency provided to ${relDisplay} (by ${personName})`;
          } else {
            return `Dependency no longer provided to ${relDisplay} (by ${personName})`;
          }
        } else {
          if (event.action === 'linked') {
            return `Dependency added: now depends on ${relDisplay} (by ${personName})`;
          } else {
            return `Dependency removed: no longer depends on ${relDisplay} (by ${personName})`;
          }
        }

      case 'monitor':
        if (event.action === 'added') {
          return `${personName} started monitoring`;
        } else {
          return `${personName} stopped monitoring`;
        }

      case 'ignored':
        if (event.action === 'set') {
          return `${personName} marked item as ignored`;
        } else {
          return `${personName} removed ignore flag`;
        }

      case 'taken':
        if (event.action === 'taken') {
          return `${personName} took responsibility`;
        } else {
          return `${personName} surrendered responsibility`;
        }

      case 'unknown':
        return `Unknown action (${event.recordType})`;

      default:
        return `Unknown event type`;
    }
  }
}

/**
 * Utility functions for working with audit entries
 */

/**
 * Sort audit entries by timestamp, newest first
 */
export function sortAuditEntries(entries) {
  return entries.sort((a, b) => b.getDate() - a.getDate());
}

/**
 * Check if two arrays of audit entries differ
 */
export function auditEntriesDiffer(entries1, entries2) {
  const keys1 = new Set(entries1.map(e => e.getKey()));
  const keys2 = new Set(entries2.map(e => e.getKey()));

  if (keys1.size !== keys2.size) {
    return true;
  }

  for (const key of keys1) {
    if (!keys2.has(key)) {
      return true;
    }
  }

  return false;
}
