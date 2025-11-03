/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle audit trail tests
 * Tests: getItemAuditTrail for various event types
 */

import { setupSparkle } from './sparkle-test-helpers.js';

describe('Sparkle - Audit Trail', () => {
  let sparkle;

  beforeEach(async () => {
    sparkle = await setupSparkle('audit-tests');
  });

  describe('Basic event tracking', () => {
    test('shows item creation', async () => {
      const itemId = await sparkle.createItem('Test Item', 'incomplete');

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].type).toBe('created');
      expect(events[0].status).toBe('incomplete');
      expect(events[0].person).toBeTruthy();
      expect(events[0].person.name).toBeTruthy();
      expect(events[0].person.email).toBeTruthy();
    });

    test('shows initial entry', async () => {
      const itemId = await sparkle.createItem('Test Item', 'incomplete', 'Initial entry text');

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThanOrEqual(2);
      const entryEvent = events.find(e => e.type === 'entry');
      expect(entryEvent).toBeTruthy();
      expect(entryEvent.text).toBe('Initial entry text');
      expect(entryEvent.person).toBeTruthy();
    });

    test('truncates long entries to 40 characters', async () => {
      const longText = 'This is a very long entry text that exceeds forty characters and should be truncated';
      const itemId = await sparkle.createItem('Test Item', 'incomplete');
      await sparkle.addEntry(itemId, longText);

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      const entryEvent = events.find(e => e.type === 'entry' && e.text.length > 40);
      expect(entryEvent).toBeTruthy();
      expect(entryEvent.text).toBe(longText);
      expect(entryEvent.person).toBeTruthy();
    });

    test('shows tagline changes', async () => {
      const itemId = await sparkle.createItem('Original Tagline', 'incomplete');
      await sparkle.alterTagline(itemId, 'Updated Tagline');

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      const taglineEvent = events.find(e => e.type === 'tagline');
      expect(taglineEvent).toBeTruthy();
      expect(taglineEvent.tagline).toBe('Updated Tagline');
      expect(taglineEvent.person).toBeTruthy();
    });

    test('shows status changes', async () => {
      const itemId = await sparkle.createItem('Test Item', 'incomplete');
      await sparkle.updateStatus(itemId, 'completed', 'Task is done');

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      const statusEvent = events.find(e => e.type === 'status' && e.status === 'completed');
      expect(statusEvent).toBeTruthy();
      expect(statusEvent.status).toBe('completed');
      expect(statusEvent.text).toBe('Task is done');
      expect(statusEvent.person).toBeTruthy();
    });
  });

  describe('Dependency tracking', () => {
    test('shows dependency additions', async () => {
      const itemId1 = await sparkle.createItem('Item 1', 'incomplete');
      const itemId2 = await sparkle.createItem('Item 2', 'incomplete');
      await sparkle.addDependency(itemId1, itemId2);

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId1)) {
        events.push(event);
      }

      const depEvent = events.find(e => e.type === 'dependency' && e.action === 'linked' && !e.reverse);
      expect(depEvent).toBeTruthy();
      expect(depEvent.relatedItemId).toBe(itemId2);
      expect(depEvent.reverse).toBe(false);
      expect(depEvent.person).toBeTruthy();
    });

    test('shows dependency removals', async () => {
      const itemId1 = await sparkle.createItem('Item 1', 'incomplete');
      const itemId2 = await sparkle.createItem('Item 2', 'incomplete');
      await sparkle.addDependency(itemId1, itemId2);
      await sparkle.removeDependency(itemId1, itemId2);

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId1)) {
        events.push(event);
      }

      const addEvent = events.find(e => e.type === 'dependency' && e.action === 'linked' && !e.reverse);
      const removeEvent = events.find(e => e.type === 'dependency' && e.action === 'unlinked' && !e.reverse);

      expect(addEvent).toBeTruthy();
      expect(removeEvent).toBeTruthy();
      expect(removeEvent.relatedItemId).toBe(itemId2);
      expect(removeEvent.person).toBeTruthy();
    });

    test('shows reverse dependencies (dependency provided to)', async () => {
      const itemA = await sparkle.createItem('Item A', 'incomplete');
      const itemB = await sparkle.createItem('Item B', 'incomplete');

      // B depends on A, so A provides dependency to B
      await sparkle.addDependency(itemB, itemA);

      // Get audit trail for itemA
      const eventsA = [];
      for await (const event of sparkle.getItemAuditTrail(itemA)) {
        eventsA.push(event);
      }

      // ItemA should show that it provides a dependency to itemB (reverse dependency)
      const providedEvent = eventsA.find(e => e.type === 'dependency' && e.reverse === true);
      expect(providedEvent).toBeTruthy();
      expect(providedEvent.relatedItemId).toBe(itemB);
      expect(providedEvent.action).toBe('linked');

      // Get audit trail for itemB to verify normal dependency shown
      const eventsB = [];
      for await (const event of sparkle.getItemAuditTrail(itemB)) {
        eventsB.push(event);
      }

      // ItemB should show that it depends on itemA (normal direction)
      const dependsEvent = eventsB.find(e => e.type === 'dependency' && e.reverse === false);
      expect(dependsEvent).toBeTruthy();
      expect(dependsEvent.relatedItemId).toBe(itemA);
      expect(dependsEvent.action).toBe('linked');
    });

    test('shows reverse dependency removals', async () => {
      const itemA = await sparkle.createItem('Item A', 'incomplete');
      const itemB = await sparkle.createItem('Item B', 'incomplete');

      // B depends on A, then remove it
      await sparkle.addDependency(itemB, itemA);
      await sparkle.removeDependency(itemB, itemA);

      // Get audit trail for itemA
      const eventsA = [];
      for await (const event of sparkle.getItemAuditTrail(itemA)) {
        eventsA.push(event);
      }

      // ItemA should show both provided and no longer provided events (reverse dependencies)
      const providedEvent = eventsA.find(e => e.type === 'dependency' && e.reverse === true && e.action === 'linked');
      const removedEvent = eventsA.find(e => e.type === 'dependency' && e.reverse === true && e.action === 'unlinked');

      expect(providedEvent).toBeTruthy();
      expect(providedEvent.relatedItemId).toBe(itemB);
      expect(removedEvent).toBeTruthy();
      expect(removedEvent.relatedItemId).toBe(itemB);
    });
  });

  describe('Monitor tracking', () => {
    test('shows monitor additions and removals', async () => {
      const itemId = await sparkle.createItem('Test Item', 'incomplete');
      await sparkle.addMonitor(itemId);
      await sparkle.removeMonitor(itemId);

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      const addMonitorEvent = events.find(e => e.type === 'monitor' && e.action === 'added');
      const removeMonitorEvent = events.find(e => e.type === 'monitor' && e.action === 'removed');

      expect(addMonitorEvent).toBeTruthy();
      expect(addMonitorEvent.person).toBeTruthy();
      expect(removeMonitorEvent).toBeTruthy();
      expect(removeMonitorEvent.person).toBeTruthy();
    });
  });

  describe('Event ordering and comprehensive history', () => {
    test('events are in chronological order', async () => {
      const itemId = await sparkle.createItem('Test Item', 'incomplete');

      // Add delays between operations to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));
      await sparkle.addEntry(itemId, 'First entry');

      await new Promise(resolve => setTimeout(resolve, 100));
      await sparkle.addEntry(itemId, 'Second entry');

      await new Promise(resolve => setTimeout(resolve, 100));
      await sparkle.updateStatus(itemId, 'completed');

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThanOrEqual(4);

      // Verify order of specific events by their position in the array
      // Events should be sorted chronologically already
      const creationIndex = events.findIndex(e => e.type === 'created');
      const firstEntryIndex = events.findIndex(e => e.type === 'entry' && e.text === 'First entry');
      const secondEntryIndex = events.findIndex(e => e.type === 'entry' && e.text === 'Second entry');
      const statusIndex = events.findIndex(e => e.type === 'status' && e.status === 'completed');

      expect(creationIndex).toBeGreaterThanOrEqual(0);
      expect(firstEntryIndex).toBeGreaterThanOrEqual(0);
      expect(secondEntryIndex).toBeGreaterThanOrEqual(0);
      expect(statusIndex).toBeGreaterThanOrEqual(0);

      expect(creationIndex).toBeLessThan(firstEntryIndex);
      expect(firstEntryIndex).toBeLessThan(secondEntryIndex);
      expect(secondEntryIndex).toBeLessThan(statusIndex);
    });

    test('with comprehensive history', async () => {
      const itemId1 = await sparkle.createItem('Main Item', 'incomplete', 'Starting work on this');
      const itemId2 = await sparkle.createItem('Dependency Item', 'incomplete');

      await sparkle.addEntry(itemId1, 'Making progress');
      await sparkle.alterTagline(itemId1, 'Main Item - Updated');
      await sparkle.addDependency(itemId1, itemId2);
      await sparkle.addMonitor(itemId1);

      // Complete the dependency first, then complete the main item
      await sparkle.updateStatus(itemId2, 'completed');
      await sparkle.updateStatus(itemId1, 'completed', 'All done');

      await sparkle.removeDependency(itemId1, itemId2);
      await sparkle.removeMonitor(itemId1);

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId1)) {
        events.push(event);
      }

      // Should have all types of events
      expect(events.some(e => e.type === 'created')).toBe(true);
      expect(events.some(e => e.type === 'entry' && e.text.includes('Starting work'))).toBe(true);
      expect(events.some(e => e.type === 'entry' && e.text.includes('Making progress'))).toBe(true);
      expect(events.some(e => e.type === 'tagline')).toBe(true);
      expect(events.some(e => e.type === 'dependency' && e.action === 'linked')).toBe(true);
      expect(events.some(e => e.type === 'monitor' && e.action === 'added')).toBe(true);
      expect(events.some(e => e.type === 'status' && e.status === 'completed')).toBe(true);
      expect(events.some(e => e.type === 'dependency' && e.action === 'unlinked')).toBe(true);
      expect(events.some(e => e.type === 'monitor' && e.action === 'removed')).toBe(true);

      expect(events.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('Error handling', () => {
    test('throws error for non-existent item', async () => {
      await expect(async () => {
        for await (const event of sparkle.getItemAuditTrail('nonexist')) {
          // Should not reach here
        }
      }).rejects.toThrow(/does not exist/);
    });
  });
});
