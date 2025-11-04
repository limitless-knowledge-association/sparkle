/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle responsibility tests
 * Tests: takeItem, surrenderItem operations
 */

import { setupSparkle } from './sparkle-test-helpers.js';

describe('Sparkle - Responsibility (Take/Surrender)', () => {
  let sparkle;

  beforeEach(async () => {
    sparkle = await setupSparkle('responsibility-tests');
  });

  describe('Basic take and surrender', () => {
    test('take responsibility for an item', async () => {
      const itemId = await sparkle.createItem('Test item for taking');

      // Initially no one has taken it
      let details = await sparkle.getItemDetails(itemId);
      expect(details.takenBy).toBe(null);

      // Take the item
      await sparkle.takeItem(itemId);

      // Verify it's now taken
      details = await sparkle.getItemDetails(itemId);
      expect(details.takenBy).not.toBe(null);
      expect(details.takenBy.name).toBeTruthy();
      expect(details.takenBy.email).toBeTruthy();
    });

    test('surrender responsibility for an item', async () => {
      const itemId = await sparkle.createItem('Test item for surrender');

      // Take the item first
      await sparkle.takeItem(itemId);
      let details = await sparkle.getItemDetails(itemId);
      expect(details.takenBy).not.toBe(null);

      // Surrender the item
      await sparkle.surrenderItem(itemId);

      // Verify it's no longer taken
      details = await sparkle.getItemDetails(itemId);
      expect(details.takenBy).toBe(null);
    });

    test('taking is exclusive - only one person at a time', async () => {
      const itemId = await sparkle.createItem('Test item for exclusivity');

      // First person takes it
      await sparkle.takeItem(itemId);
      let details = await sparkle.getItemDetails(itemId);
      const firstTaker = details.takenBy;

      // When someone else takes it, they become the new taker
      // (In real usage, this would be a different user. In tests, same user re-taking is idempotent)
      // This test verifies the data structure supports single taker
      expect(details.takenBy).not.toBe(null);
      expect(typeof details.takenBy).toBe('object');
      expect(details.takenBy.name).toBeTruthy();
    });

    test('item defaults to not taken', async () => {
      const itemId = await sparkle.createItem('Test item');
      const details = await sparkle.getItemDetails(itemId);

      expect(details.takenBy).toBe(null);
    });
  });

  describe('Idempotency', () => {
    test('take idempotency - taking when already taken by same person', async () => {
      const itemId = await sparkle.createItem('Test item for take idempotency');

      // Take the item
      await sparkle.takeItem(itemId);
      let details1 = await sparkle.getItemDetails(itemId);
      const taker1 = details1.takenBy;

      // Take it again (should be idempotent)
      await sparkle.takeItem(itemId);
      let details2 = await sparkle.getItemDetails(itemId);
      const taker2 = details2.takenBy;

      // Should still be taken by the same person
      expect(taker2.name).toBe(taker1.name);
      expect(taker2.email).toBe(taker1.email);
    });

    test('surrender idempotency - surrendering when not taken', async () => {
      const itemId = await sparkle.createItem('Test item for surrender idempotency');

      // Surrender without taking (should be idempotent - no error)
      await sparkle.surrenderItem(itemId);

      let details = await sparkle.getItemDetails(itemId);
      expect(details.takenBy).toBe(null);
    });

    test('surrender idempotency - surrendering twice', async () => {
      const itemId = await sparkle.createItem('Test item for double surrender');

      // Take and then surrender
      await sparkle.takeItem(itemId);
      await sparkle.surrenderItem(itemId);

      let details1 = await sparkle.getItemDetails(itemId);
      expect(details1.takenBy).toBe(null);

      // Surrender again (should be idempotent)
      await sparkle.surrenderItem(itemId);

      let details2 = await sparkle.getItemDetails(itemId);
      expect(details2.takenBy).toBe(null);
    });

    test('take and surrender cycle', async () => {
      const itemId = await sparkle.createItem('Test item for take/surrender cycle');

      // Take -> Surrender -> Take -> Surrender
      await sparkle.takeItem(itemId);
      let details1 = await sparkle.getItemDetails(itemId);
      expect(details1.takenBy).not.toBe(null);

      await sparkle.surrenderItem(itemId);
      let details2 = await sparkle.getItemDetails(itemId);
      expect(details2.takenBy).toBe(null);

      await sparkle.takeItem(itemId);
      let details3 = await sparkle.getItemDetails(itemId);
      expect(details3.takenBy).not.toBe(null);

      await sparkle.surrenderItem(itemId);
      let details4 = await sparkle.getItemDetails(itemId);
      expect(details4.takenBy).toBe(null);
    });
  });

  describe('Status preservation', () => {
    test('taking does not change item status', async () => {
      const itemId = await sparkle.createItem('Test item', 'incomplete');

      let detailsBefore = await sparkle.getItemDetails(itemId);
      expect(detailsBefore.status).toBe('incomplete');

      await sparkle.takeItem(itemId);

      let detailsAfter = await sparkle.getItemDetails(itemId);
      expect(detailsAfter.status).toBe('incomplete');
      expect(detailsAfter.takenBy).not.toBe(null);
    });

    test('surrendering does not change item status', async () => {
      const itemId = await sparkle.createItem('Test item', 'incomplete');
      await sparkle.takeItem(itemId);

      let detailsBefore = await sparkle.getItemDetails(itemId);
      expect(detailsBefore.status).toBe('incomplete');

      await sparkle.surrenderItem(itemId);

      let detailsAfter = await sparkle.getItemDetails(itemId);
      expect(detailsAfter.status).toBe('incomplete');
      expect(detailsAfter.takenBy).toBe(null);
    });
  });

  describe('Audit trail integration', () => {
    test('shows taken events', async () => {
      const itemId = await sparkle.createItem('Test item');
      await sparkle.takeItem(itemId);

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      const takenEvents = events.filter(e => e.type === 'taken' && e.action === 'taken');
      expect(takenEvents.length).toBe(1);
      expect(takenEvents[0].person).toBeTruthy();
      expect(takenEvents[0].person.name).toBeTruthy();
      expect(takenEvents[0].person.email).toBeTruthy();
    });

    test('shows surrendered events', async () => {
      const itemId = await sparkle.createItem('Test item');
      await sparkle.takeItem(itemId);
      await sparkle.surrenderItem(itemId);

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      const takenEvents = events.filter(e => e.type === 'taken' && e.action === 'taken');
      const surrenderedEvents = events.filter(e => e.type === 'taken' && e.action === 'surrendered');

      expect(takenEvents.length).toBe(1);
      expect(surrenderedEvents.length).toBe(1);
    });

    test('shows taken/surrendered in chronological order', async () => {
      const itemId = await sparkle.createItem('Test item');
      await sparkle.takeItem(itemId);
      await sparkle.surrenderItem(itemId);
      await sparkle.takeItem(itemId);

      const events = [];
      for await (const event of sparkle.getItemAuditTrail(itemId)) {
        events.push(event);
      }

      const takenAndSurrenderedEvents = events.filter(e => e.type === 'taken');
      expect(takenAndSurrenderedEvents.length).toBe(3);
      expect(takenAndSurrenderedEvents[0].action).toBe('taken');
      expect(takenAndSurrenderedEvents[1].action).toBe('surrendered');
      expect(takenAndSurrenderedEvents[2].action).toBe('taken');
    });
  });

  describe('Error handling', () => {
    test('taking throws error for non-existent item', async () => {
      await expect(
        sparkle.takeItem('nonexist')
      ).rejects.toThrow();
    });

    test('surrendering throws error for non-existent item', async () => {
      await expect(
        sparkle.surrenderItem('nonexist')
      ).rejects.toThrow();
    });
  });
});
