/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Utils Aggregates Test Suite
 * Tests getTakers and loadAllowedStatuses functions to ensure correct path handling
 */

import { getTakers, loadAllowedStatuses } from '../../src/utils.js';
import { unit_test_setup } from '../helpers/test-helpers.js';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Utils Aggregates - Path Handling', () => {
  let testDir;

  beforeEach(async () => {
    testDir = await unit_test_setup(import.meta.url, 'utils-aggregates-tests');
  });

  describe('Directory Structure Verification', () => {
    test('test directory should NOT have double-nested .sparkle-worktree', () => {
      // Verify that testDir does not contain double-nested paths
      const doubleNestedPath = join(testDir, '.sparkle-worktree', 'sparkle-data');
      expect(existsSync(doubleNestedPath)).toBe(false);
    });

    test('test directory should be at correct level', () => {
      // testDir should be the sparkle-data directory itself
      expect(testDir).toMatch(/\.integration_testing\/unit-test-/);
    });
  });

  describe('getTakers', () => {
    test('returns empty array when takers.json does not exist', async () => {
      const takers = await getTakers(testDir);
      expect(takers).toEqual([]);
    });

    test('reads takers from correct aggregate path', async () => {
      // Create .aggregates directory
      const aggregateDir = join(testDir, '.aggregates');
      await mkdir(aggregateDir, { recursive: true });

      // Create takers.json with test data
      const takersData = [
        {
          name: 'Test User 1',
          email: 'test1@example.com',
          hash: 'abc12345'
        },
        {
          name: 'Test User 2',
          email: 'test2@example.com',
          hash: 'def67890'
        }
      ];

      const takersPath = join(aggregateDir, 'takers.json');
      await writeFile(takersPath, JSON.stringify(takersData, null, 2), 'utf8');

      // Verify file was created
      expect(existsSync(takersPath)).toBe(true);

      // Call getTakers - should find file at correct path
      const takers = await getTakers(testDir);

      expect(takers).toEqual(takersData);
      expect(takers.length).toBe(2);
      expect(takers[0].name).toBe('Test User 1');
      expect(takers[1].email).toBe('test2@example.com');
    });

    test('does NOT look for double-nested path', async () => {
      // Create the WRONG double-nested path (old buggy behavior)
      const wrongPath = join(testDir, '.sparkle-worktree', 'sparkle-data', '.aggregates');
      await mkdir(wrongPath, { recursive: true });

      const wrongTakersPath = join(wrongPath, 'takers.json');
      await writeFile(wrongTakersPath, JSON.stringify([
        { name: 'Wrong Location', email: 'wrong@example.com', hash: 'wrong123' }
      ]), 'utf8');

      // Create the CORRECT path
      const correctPath = join(testDir, '.aggregates');
      await mkdir(correctPath, { recursive: true });

      const correctTakersPath = join(correctPath, 'takers.json');
      await writeFile(correctTakersPath, JSON.stringify([
        { name: 'Correct Location', email: 'correct@example.com', hash: 'correct123' }
      ]), 'utf8');

      // getTakers should read from correct path, not wrong path
      const takers = await getTakers(testDir);

      expect(takers.length).toBe(1);
      expect(takers[0].name).toBe('Correct Location');
      expect(takers[0].email).toBe('correct@example.com');
    });

    test('returns empty array on invalid JSON structure', async () => {
      const aggregateDir = join(testDir, '.aggregates');
      await mkdir(aggregateDir, { recursive: true });

      // Write invalid data (object instead of array)
      const takersPath = join(aggregateDir, 'takers.json');
      await writeFile(takersPath, '{"invalid": "data"}', 'utf8');

      const takers = await getTakers(testDir);
      expect(takers).toEqual([]);
    });
  });

  describe('loadAllowedStatuses', () => {
    test('returns null when statuses.json does not exist', async () => {
      const statuses = await loadAllowedStatuses(testDir);
      expect(statuses).toBeNull();
    });

    test('reads statuses from correct aggregate path', async () => {
      // Create .aggregates directory
      const aggregateDir = join(testDir, '.aggregates');
      await mkdir(aggregateDir, { recursive: true });

      // Create statuses.json with test data
      const statusesData = ['In Progress', 'On Hold', 'Blocked'];
      const statusesPath = join(aggregateDir, 'statuses.json');
      await writeFile(statusesPath, JSON.stringify(statusesData, null, 2), 'utf8');

      // Verify file was created
      expect(existsSync(statusesPath)).toBe(true);

      // Call loadAllowedStatuses
      const statuses = await loadAllowedStatuses(testDir);

      // Should return a Set containing built-in + custom statuses
      expect(statuses).toBeInstanceOf(Set);
      expect(statuses.has('completed')).toBe(true); // built-in
      expect(statuses.has('incomplete')).toBe(true); // built-in
      expect(statuses.has('In Progress')).toBe(true); // custom
      expect(statuses.has('On Hold')).toBe(true); // custom
      expect(statuses.has('Blocked')).toBe(true); // custom
    });

    test('does NOT look for double-nested path', async () => {
      // Create the WRONG double-nested path (old buggy behavior)
      const wrongPath = join(testDir, '.sparkle-worktree', 'sparkle-data', '.aggregates');
      await mkdir(wrongPath, { recursive: true });

      const wrongStatusesPath = join(wrongPath, 'statuses.json');
      await writeFile(wrongStatusesPath, JSON.stringify(['Wrong Status']), 'utf8');

      // Create the CORRECT path
      const correctPath = join(testDir, '.aggregates');
      await mkdir(correctPath, { recursive: true });

      const correctStatusesPath = join(correctPath, 'statuses.json');
      await writeFile(correctStatusesPath, JSON.stringify(['Correct Status']), 'utf8');

      // loadAllowedStatuses should read from correct path
      const statuses = await loadAllowedStatuses(testDir);

      expect(statuses).toBeInstanceOf(Set);
      expect(statuses.has('Correct Status')).toBe(true);
      expect(statuses.has('Wrong Status')).toBe(false);
    });

    test('falls back to legacy path when aggregate path does not exist', async () => {
      // Create statuses.json at legacy path (root of testDir)
      const legacyStatusesPath = join(testDir, 'statuses.json');
      await writeFile(legacyStatusesPath, JSON.stringify(['Legacy Status']), 'utf8');

      const statuses = await loadAllowedStatuses(testDir);

      expect(statuses).toBeInstanceOf(Set);
      expect(statuses.has('Legacy Status')).toBe(true);
    });

    test('prefers aggregate path over legacy path', async () => {
      // Create statuses.json at BOTH paths
      const aggregateDir = join(testDir, '.aggregates');
      await mkdir(aggregateDir, { recursive: true });

      const aggregateStatusesPath = join(aggregateDir, 'statuses.json');
      await writeFile(aggregateStatusesPath, JSON.stringify(['Aggregate Status']), 'utf8');

      const legacyStatusesPath = join(testDir, 'statuses.json');
      await writeFile(legacyStatusesPath, JSON.stringify(['Legacy Status']), 'utf8');

      // Should prefer aggregate path
      const statuses = await loadAllowedStatuses(testDir);

      expect(statuses.has('Aggregate Status')).toBe(true);
      expect(statuses.has('Legacy Status')).toBe(false);
    });

    test('throws error on invalid JSON structure', async () => {
      const aggregateDir = join(testDir, '.aggregates');
      await mkdir(aggregateDir, { recursive: true });

      // Write invalid data (object instead of array)
      const statusesPath = join(aggregateDir, 'statuses.json');
      await writeFile(statusesPath, '{"invalid": "data"}', 'utf8');

      await expect(loadAllowedStatuses(testDir)).rejects.toThrow('must contain a JSON array');
    });
  });
});
