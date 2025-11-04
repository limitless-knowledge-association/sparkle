/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Unit tests for list filtering logic
 */

import {
  filterByPendingStatus,
  filterByMonitorStatus,
  filterByIgnoredStatus,
  filterByTakenStatus,
  filterByText,
  applyAllFilters
} from '../../public/listFilter.js';

// Sample test data
const createItems = () => [
  { itemId: '12345678', tagline: 'Fix login bug', status: 'incomplete', created: '20250101000000000' },
  { itemId: '23456789', tagline: 'Add dashboard feature', status: 'in-progress', created: '20250101000001000' },
  { itemId: '34567890', tagline: 'Update documentation', status: 'completed', created: '20250101000002000' },
  { itemId: '45678901', tagline: 'Refactor authentication', status: 'incomplete', created: '20250101000003000' },
  { itemId: '56789012', tagline: 'Fix dashboard layout', status: 'in-progress', created: '20250101000004000' }
];

describe('List Filter', () => {
  // ===== Pending Status Filter Tests =====

  describe('filterByPendingStatus', () => {
    test('all returns all items', () => {
      const items = createItems();
      const pendingIds = new Set(['12345678', '23456789']);

      const result = filterByPendingStatus(items, pendingIds, 'all');

      expect(result.length).toBe(5);
    });

    test('pending returns only pending items', () => {
      const items = createItems();
      const pendingIds = new Set(['12345678', '45678901']);

      const result = filterByPendingStatus(items, pendingIds, 'pending');

      expect(result.length).toBe(2);
      expect(result.some(i => i.itemId === '12345678')).toBe(true);
      expect(result.some(i => i.itemId === '45678901')).toBe(true);
    });

    test('not-pending returns non-pending items', () => {
      const items = createItems();
      const pendingIds = new Set(['12345678', '45678901']);

      const result = filterByPendingStatus(items, pendingIds, 'not-pending');

      expect(result.length).toBe(3);
      expect(result.some(i => i.itemId === '12345678')).toBe(false);
      expect(result.some(i => i.itemId === '45678901')).toBe(false);
    });

    test('empty pending set with pending filter returns empty', () => {
      const items = createItems();
      const pendingIds = new Set();

      const result = filterByPendingStatus(items, pendingIds, 'pending');

      expect(result.length).toBe(0);
    });

    test('empty pending set with not-pending returns all', () => {
      const items = createItems();
      const pendingIds = new Set();

      const result = filterByPendingStatus(items, pendingIds, 'not-pending');

      expect(result.length).toBe(5);
    });

    test('all items pending with pending filter returns all', () => {
      const items = createItems();
      const pendingIds = new Set(items.map(i => i.itemId));

      const result = filterByPendingStatus(items, pendingIds, 'pending');

      expect(result.length).toBe(5);
    });

    test('all items pending with not-pending returns empty', () => {
      const items = createItems();
      const pendingIds = new Set(items.map(i => i.itemId));

      const result = filterByPendingStatus(items, pendingIds, 'not-pending');

      expect(result.length).toBe(0);
    });
  });

  // ===== Monitor Status Filter Tests =====

  describe('filterByMonitorStatus', () => {
    test('all returns all items', () => {
      const items = createItems();
      const cache = new Map();

      const result = filterByMonitorStatus(items, cache, 'user@example.com', 'all');

      expect(result.length).toBe(5);
    });

    test('monitored returns only monitored items', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { monitors: [{ email: 'user@example.com' }] }],
        ['23456789', { monitors: [] }],
        ['34567890', { monitors: [{ email: 'other@example.com' }] }],
        ['45678901', { monitors: [{ email: 'user@example.com' }, { email: 'other@example.com' }] }],
        ['56789012', { monitors: [] }]
      ]);

      const result = filterByMonitorStatus(items, cache, 'user@example.com', 'monitored');

      expect(result.length).toBe(2);
      expect(result.some(i => i.itemId === '12345678')).toBe(true);
      expect(result.some(i => i.itemId === '45678901')).toBe(true);
    });

    test('not-monitored returns non-monitored items', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { monitors: [{ email: 'user@example.com' }] }],
        ['23456789', { monitors: [] }],
        ['34567890', { monitors: [{ email: 'other@example.com' }] }],
        ['45678901', { monitors: [{ email: 'user@example.com' }] }],
        ['56789012', { monitors: [] }]
      ]);

      const result = filterByMonitorStatus(items, cache, 'user@example.com', 'not-monitored');

      expect(result.length).toBe(3);
      expect(result.some(i => i.itemId === '12345678')).toBe(false);
      expect(result.some(i => i.itemId === '45678901')).toBe(false);
    });

    test('missing cache entry treated as not monitored', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { monitors: [{ email: 'user@example.com' }] }]
      ]);

      const result = filterByMonitorStatus(items, cache, 'user@example.com', 'monitored');

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('12345678');
    });

    test('empty monitors array treated as not monitored', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { monitors: [] }],
        ['23456789', { monitors: [] }]
      ]);

      const result = filterByMonitorStatus(items, cache, 'user@example.com', 'monitored');

      expect(result.length).toBe(0);
    });

    test('case-sensitive email matching', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { monitors: [{ email: 'User@Example.Com' }] }]
      ]);

      const result = filterByMonitorStatus(items, cache, 'user@example.com', 'monitored');

      expect(result.length).toBe(0);
    });

    test('multiple monitors on same item', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', {
          monitors: [
            { email: 'user1@example.com' },
            { email: 'user2@example.com' },
            { email: 'user3@example.com' }
          ]
        }]
      ]);

      const result = filterByMonitorStatus(items, cache, 'user2@example.com', 'monitored');

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('12345678');
    });
  });

  // ===== Ignored Status Filter Tests =====

  describe('filterByIgnoredStatus', () => {
    test('all returns all items', () => {
      const items = createItems();
      const cache = new Map();

      const result = filterByIgnoredStatus(items, cache, 'all');

      expect(result.length).toBe(5);
    });

    test('ignored returns only ignored items', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { ignored: true }],
        ['23456789', { ignored: false }],
        ['34567890', { ignored: true }],
        ['45678901', { ignored: false }],
        ['56789012', { ignored: false }]
      ]);

      const result = filterByIgnoredStatus(items, cache, 'ignored');

      expect(result.length).toBe(2);
      expect(result.some(i => i.itemId === '12345678')).toBe(true);
      expect(result.some(i => i.itemId === '34567890')).toBe(true);
    });

    test('not-ignored returns non-ignored items', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { ignored: true }],
        ['23456789', { ignored: false }],
        ['34567890', { ignored: true }],
        ['45678901', { ignored: false }],
        ['56789012', { ignored: false }]
      ]);

      const result = filterByIgnoredStatus(items, cache, 'not-ignored');

      expect(result.length).toBe(3);
      expect(result.some(i => i.itemId === '12345678')).toBe(false);
      expect(result.some(i => i.itemId === '34567890')).toBe(false);
    });

    test('missing cache entry treated as not ignored', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { ignored: true }]
      ]);

      const result = filterByIgnoredStatus(items, cache, 'ignored');

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('12345678');
    });

    test('false treated as not ignored', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { ignored: false }],
        ['23456789', { ignored: false }]
      ]);

      const result = filterByIgnoredStatus(items, cache, 'ignored');

      expect(result.length).toBe(0);
    });

    test('undefined treated as not ignored', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', {}],
        ['23456789', { ignored: undefined }]
      ]);

      const result = filterByIgnoredStatus(items, cache, 'ignored');

      expect(result.length).toBe(0);
    });
  });

  // ===== Taken Status Filter Tests =====

  describe('filterByTakenStatus', () => {
    test('all returns all items', () => {
      const items = createItems();
      const cache = new Map();

      const result = filterByTakenStatus(items, cache, 'all');

      expect(result.length).toBe(5);
    });

    test('taken returns only taken items', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
        ['23456789', { takenBy: null }],
        ['34567890', { takenBy: { name: 'Bob', email: 'bob@example.com' } }],
        ['45678901', { takenBy: null }],
        ['56789012', { takenBy: null }]
      ]);

      const result = filterByTakenStatus(items, cache, 'taken');

      expect(result.length).toBe(2);
      expect(result.some(i => i.itemId === '12345678')).toBe(true);
      expect(result.some(i => i.itemId === '34567890')).toBe(true);
    });

    test('not-taken returns non-taken items', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
        ['23456789', { takenBy: null }],
        ['34567890', { takenBy: { name: 'Bob', email: 'bob@example.com' } }],
        ['45678901', { takenBy: null }],
        ['56789012', { takenBy: null }]
      ]);

      const result = filterByTakenStatus(items, cache, 'not-taken');

      expect(result.length).toBe(3);
      expect(result.some(i => i.itemId === '12345678')).toBe(false);
      expect(result.some(i => i.itemId === '34567890')).toBe(false);
    });

    test('filter by specific person email', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
        ['23456789', { takenBy: { name: 'Bob', email: 'bob@example.com' } }],
        ['34567890', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
        ['45678901', { takenBy: { name: 'Charlie', email: 'charlie@example.com' } }],
        ['56789012', { takenBy: null }]
      ]);

      const result = filterByTakenStatus(items, cache, 'alice@example.com');

      expect(result.length).toBe(2);
      expect(result.some(i => i.itemId === '12345678')).toBe(true);
      expect(result.some(i => i.itemId === '34567890')).toBe(true);
    });

    test('missing cache entry treated as not taken', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }]
      ]);

      const result = filterByTakenStatus(items, cache, 'taken');

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('12345678');
    });

    test('null takenBy treated as not taken', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: null }],
        ['23456789', { takenBy: null }]
      ]);

      const result = filterByTakenStatus(items, cache, 'taken');

      expect(result.length).toBe(0);
    });

    test('undefined takenBy treated as not taken', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', {}],
        ['23456789', { takenBy: undefined }]
      ]);

      const result = filterByTakenStatus(items, cache, 'taken');

      expect(result.length).toBe(0);
    });

    test('case-sensitive email matching', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: { name: 'Alice', email: 'Alice@Example.Com' } }]
      ]);

      const result = filterByTakenStatus(items, cache, 'alice@example.com');

      expect(result.length).toBe(0);
    });

    test('only one taker per item', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }]
      ]);

      const result = filterByTakenStatus(items, cache, 'alice@example.com');

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('12345678');
      expect(typeof cache.get('12345678').takenBy).toBe('object');
    });
  });

  // ===== Text Search Filter Tests =====

  describe('filterByText', () => {
    test('empty string returns all items', () => {
      const items = createItems();

      const result = filterByText(items, '');

      expect(result.length).toBe(5);
    });

    test('whitespace-only returns all items', () => {
      const items = createItems();

      const result = filterByText(items, '   ');

      expect(result.length).toBe(5);
    });

    test('search by full itemId', () => {
      const items = createItems();

      const result = filterByText(items, '12345678');

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('12345678');
    });

    test('search by partial itemId', () => {
      const items = createItems();

      const result = filterByText(items, '234');

      expect(result.length).toBe(2);
      expect(result.some(i => i.itemId === '12345678')).toBe(true);
      expect(result.some(i => i.itemId === '23456789')).toBe(true);
    });

    test('search is case-insensitive', () => {
      const items = [
        { itemId: 'ABC12345', tagline: 'Test Item', status: 'incomplete' }
      ];

      const result1 = filterByText(items, 'abc');
      expect(result1.length).toBe(1);

      const result2 = filterByText(items, 'TEST');
      expect(result2.length).toBe(1);
    });

    test('search in tagline', () => {
      const items = createItems();

      const result = filterByText(items, 'login');

      expect(result.length).toBe(1);
      expect(result[0].tagline).toBe('Fix login bug');
    });

    test('search matches both itemId and tagline', () => {
      const items = createItems();

      const result = filterByText(items, 'dashboard');

      expect(result.length).toBe(2);
    });

    test('search matches partial words in tagline', () => {
      const items = createItems();

      const result = filterByText(items, 'doc');

      expect(result.length).toBe(1);
      expect(result[0].tagline).toBe('Update documentation');
    });

    test('search with spaces', () => {
      const items = createItems();

      const result = filterByText(items, 'login bug');

      expect(result.length).toBe(1);
      expect(result[0].tagline).toBe('Fix login bug');
    });

    test('search with special characters', () => {
      const items = [
        { itemId: '12345678', tagline: 'Fix bug!', status: 'incomplete' }
      ];

      const result = filterByText(items, 'bug!');

      expect(result.length).toBe(1);
    });

    test('no matches returns empty array', () => {
      const items = createItems();

      const result = filterByText(items, 'nonexistent');

      expect(result.length).toBe(0);
    });

    test('trims whitespace from search text', () => {
      const items = createItems();

      const result = filterByText(items, '  login  ');

      expect(result.length).toBe(1);
    });
  });

  // ===== Combined Filter Tests =====

  describe('applyAllFilters', () => {
    test('no filters returns all items', () => {
      const items = createItems();
      const options = {
        pendingItemIds: new Set(),
        pendingFilter: 'all',
        itemDetailsCache: new Map(),
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        searchText: ''
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(5);
    });

    test('pending filter only', () => {
      const items = createItems();
      const options = {
        pendingItemIds: new Set(['12345678', '45678901']),
        pendingFilter: 'pending',
        itemDetailsCache: new Map(),
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        searchText: ''
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(2);
    });

    test('monitor filter only', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { monitors: [{ email: 'user@example.com' }] }],
        ['23456789', { monitors: [] }]
      ]);
      const options = {
        pendingItemIds: new Set(),
        pendingFilter: 'all',
        itemDetailsCache: cache,
        currentUserEmail: 'user@example.com',
        monitorFilter: 'monitored',
        searchText: ''
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('12345678');
    });

    test('text filter only', () => {
      const items = createItems();
      const options = {
        pendingItemIds: new Set(),
        pendingFilter: 'all',
        itemDetailsCache: new Map(),
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        searchText: 'dashboard'
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(2);
      expect(result.every(i => (i.itemId + i.tagline).toLowerCase().includes('dashboard'))).toBe(true);
    });

    test('pending AND text filters', () => {
      const items = createItems();
      const options = {
        pendingItemIds: new Set(['12345678', '23456789', '45678901']),
        pendingFilter: 'pending',
        itemDetailsCache: new Map(),
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        searchText: 'dashboard'
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('23456789');
    });

    test('monitor AND text filters', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { monitors: [{ email: 'user@example.com' }] }],
        ['56789012', { monitors: [{ email: 'user@example.com' }] }]
      ]);
      const options = {
        pendingItemIds: new Set(),
        pendingFilter: 'all',
        itemDetailsCache: cache,
        currentUserEmail: 'user@example.com',
        monitorFilter: 'monitored',
        searchText: 'dashboard'
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe('56789012');
    });

    test('all three filters combined', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { monitors: [{ email: 'user@example.com' }] }],
        ['23456789', { monitors: [{ email: 'user@example.com' }] }],
        ['45678901', { monitors: [{ email: 'user@example.com' }] }],
        ['56789012', { monitors: [{ email: 'user@example.com' }] }]
      ]);
      const options = {
        pendingItemIds: new Set(['12345678', '23456789', '56789012']),
        pendingFilter: 'pending',
        itemDetailsCache: cache,
        currentUserEmail: 'user@example.com',
        monitorFilter: 'monitored',
        searchText: 'dashboard'
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(2);
      const resultIds = result.map(i => i.itemId).sort();
      expect(resultIds).toEqual(['23456789', '56789012']);
    });

    test('filters that result in empty set', () => {
      const items = createItems();
      const options = {
        pendingItemIds: new Set(['12345678']),
        pendingFilter: 'pending',
        itemDetailsCache: new Map(),
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        searchText: 'nonexistent'
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(0);
    });

    test('handles missing options gracefully', () => {
      const items = createItems();
      const options = {};

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(5);
    });

    test('preserves item order', () => {
      const items = createItems();
      const options = {
        pendingItemIds: new Set(),
        pendingFilter: 'all',
        itemDetailsCache: new Map(),
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        searchText: ''
      };

      const result = applyAllFilters(items, options);

      expect(result.map(i => i.itemId)).toEqual(items.map(i => i.itemId));
    });

    test('applies ignored filter', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { ignored: true }],
        ['23456789', { ignored: false }],
        ['34567890', { ignored: true }]
      ]);

      const options = {
        pendingItemIds: new Set(),
        pendingFilter: 'all',
        itemDetailsCache: cache,
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        ignoredFilter: 'not-ignored',
        searchText: ''
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(3);
      expect(result.some(i => i.itemId === '12345678')).toBe(false);
      expect(result.some(i => i.itemId === '34567890')).toBe(false);
    });

    test('defaults to not-ignored filter', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { ignored: true }]
      ]);

      const options = {
        itemDetailsCache: cache
      };

      const result = applyAllFilters(items, options);

      expect(result.some(i => i.itemId === '12345678')).toBe(false);
    });

    test('applies taken filter', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
        ['23456789', { takenBy: null }],
        ['34567890', { takenBy: { name: 'Bob', email: 'bob@example.com' } }]
      ]);

      const options = {
        pendingItemIds: new Set(),
        pendingFilter: 'all',
        itemDetailsCache: cache,
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        ignoredFilter: 'all',
        takenFilter: 'taken',
        searchText: ''
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(2);
      expect(result.some(i => i.itemId === '12345678')).toBe(true);
      expect(result.some(i => i.itemId === '34567890')).toBe(true);
    });

    test('taken filter by specific person', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
        ['23456789', { takenBy: { name: 'Bob', email: 'bob@example.com' } }],
        ['34567890', { takenBy: { name: 'Alice', email: 'alice@example.com' } }]
      ]);

      const options = {
        pendingItemIds: new Set(),
        pendingFilter: 'all',
        itemDetailsCache: cache,
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        ignoredFilter: 'all',
        takenFilter: 'alice@example.com',
        searchText: ''
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(2);
      expect(result.some(i => i.itemId === '12345678')).toBe(true);
      expect(result.some(i => i.itemId === '34567890')).toBe(true);
      expect(result.some(i => i.itemId === '23456789')).toBe(false);
    });

    test('pending AND taken filters', () => {
      const items = createItems();
      const cache = new Map([
        ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
        ['23456789', { takenBy: { name: 'Bob', email: 'bob@example.com' } }],
        ['45678901', { takenBy: null }]
      ]);

      const options = {
        pendingItemIds: new Set(['12345678', '23456789', '45678901']),
        pendingFilter: 'pending',
        itemDetailsCache: cache,
        currentUserEmail: 'user@example.com',
        monitorFilter: 'all',
        ignoredFilter: 'all',
        takenFilter: 'taken',
        searchText: ''
      };

      const result = applyAllFilters(items, options);

      expect(result.length).toBe(2);
      expect(result.some(i => i.itemId === '12345678')).toBe(true);
      expect(result.some(i => i.itemId === '23456789')).toBe(true);
      expect(result.some(i => i.itemId === '45678901')).toBe(false);
    });
  });
});
