/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Sparkle ignore functionality tests
 * Tests: Ignoring/un-ignoring items, idempotency, status preservation
 */

import { setupSparkle } from './sparkle-test-helpers.js';

describe('Sparkle - Ignore', () => {
  let sparkle;

  beforeEach(async () => {
    sparkle = await setupSparkle('ignore-tests');
  });

  describe('Ignore and un-ignore', () => {
    test('ignore an item', async () => {
      const item = await sparkle.createItem('Test item');

      await sparkle.ignoreItem(item);

      const details = await sparkle.getItemDetails(item);
      expect(details.ignored).toBe(true);
    });

    test('un-ignore an item', async () => {
      const item = await sparkle.createItem('Test item');

      await sparkle.ignoreItem(item);
      await sparkle.unignoreItem(item);

      const details = await sparkle.getItemDetails(item);
      expect(details.ignored).toBe(false);
    });
  });

  describe('Idempotency', () => {
    test('ignoring when already ignored', async () => {
      const item = await sparkle.createItem('Test item');

      await sparkle.ignoreItem(item);
      await sparkle.ignoreItem(item); // Should be no-op

      const details = await sparkle.getItemDetails(item);
      expect(details.ignored).toBe(true);
    });

    test('un-ignoring when not ignored', async () => {
      const item = await sparkle.createItem('Test item');

      // Should not throw
      await expect(
        sparkle.unignoreItem(item)
      ).resolves.not.toThrow();

      const details = await sparkle.getItemDetails(item);
      expect(details.ignored).toBe(false);
    });

    test('re-ignoring after un-ignore', async () => {
      const item = await sparkle.createItem('Test item');

      await sparkle.ignoreItem(item);
      await sparkle.unignoreItem(item);
      await sparkle.ignoreItem(item);

      const details = await sparkle.getItemDetails(item);
      expect(details.ignored).toBe(true);
    });
  });

  describe('Status preservation', () => {
    test('ignoring does not change status', async () => {
      const item = await sparkle.createItem('Test item');
      await sparkle.updateStatus(item, 'completed');

      await sparkle.ignoreItem(item);

      const details = await sparkle.getItemDetails(item);
      expect(details.status).toBe('completed');
      expect(details.ignored).toBe(true);
    });
  });

  describe('Default state', () => {
    test('item defaults to not ignored', async () => {
      const item = await sparkle.createItem('Test item');

      const details = await sparkle.getItemDetails(item);
      expect(details.ignored).toBe(false);
    });
  });
});
