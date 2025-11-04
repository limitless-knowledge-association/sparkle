/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle item operations tests
 * Tests: Creating items, altering taglines, adding entries, updating status
 */

import { setupSparkle } from './sparkle-test-helpers.js';

describe('Sparkle - Item Operations', () => {
  let sparkle;

  beforeEach(async () => {
    sparkle = await setupSparkle('item-operations');
  });

  describe('Creating items', () => {
    test('create item with default status', async () => {
      const item = await sparkle.createItem('Test item');

      expect(item).toBeTruthy();
      expect(item.length).toBe(8);

      const details = await sparkle.getItemDetails(item);
      expect(details.tagline).toBe('Test item');
      expect(details.status).toBe('incomplete');
      expect(details.person).toBeTruthy();
      expect(details.person.name).toBeTruthy();
      expect(details.person.email).toBeTruthy();
    });

    test('create item with custom status', async () => {
      const item = await sparkle.createItem('Test item', 'incomplete');
      const details = await sparkle.getItemDetails(item);
      expect(details.status).toBe('incomplete');
    });

    test('cannot create item with completed status', async () => {
      await expect(
        sparkle.createItem('Test item', 'completed')
      ).rejects.toThrow();
    });

    test('cannot create item with empty tagline', async () => {
      await expect(
        sparkle.createItem('')
      ).rejects.toThrow();

      await expect(
        sparkle.createItem('   ')
      ).rejects.toThrow();
    });

    test('item IDs are 8 digits and do not start with 0', async () => {
      const item = await sparkle.createItem('Test item');

      expect(item.length).toBe(8);
      expect(item[0]).not.toBe('0');
      expect(/^\d+$/.test(item)).toBe(true);
    });
  });

  describe('Altering taglines', () => {
    test('alter tagline', async () => {
      const item = await sparkle.createItem('Original tagline');
      await sparkle.alterTagline(item, 'Updated tagline');

      const details = await sparkle.getItemDetails(item);
      expect(details.tagline).toBe('Updated tagline');
    });

    test('cannot alter tagline to empty', async () => {
      const item = await sparkle.createItem('Original tagline');

      await expect(
        sparkle.alterTagline(item, '')
      ).rejects.toThrow();
    });
  });

  describe('Adding entries', () => {
    test('add entry to item', async () => {
      const item = await sparkle.createItem('Test item');
      await sparkle.addEntry(item, 'First entry');
      await sparkle.addEntry(item, 'Second entry');

      const details = await sparkle.getItemDetails(item);
      expect(details.entries.length).toBe(2);
      expect(details.entries[0].text).toBe('First entry');
      expect(details.entries[1].text).toBe('Second entry');
    });
  });

  describe('Updating status', () => {
    test('update status', async () => {
      const item = await sparkle.createItem('Test item');
      await sparkle.updateStatus(item, 'completed', 'Work done');

      const details = await sparkle.getItemDetails(item);
      expect(details.status).toBe('completed');
    });
  });

  describe('Item details', () => {
    test('get details returns deep copy', async () => {
      const item = await sparkle.createItem('Test item');
      const details1 = await sparkle.getItemDetails(item);
      const details2 = await sparkle.getItemDetails(item);

      // Modifying one should not affect the other
      details1.tagline = 'Modified';
      expect(details2.tagline).toBe('Test item');
    });
  });
});
