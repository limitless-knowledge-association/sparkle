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
} from '../public/listFilter.js';

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function assertArrayEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`
    );
  }
}

// Test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\nRunning ${this.tests.length} list filter tests...\n`);

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        this.passed++;
        console.log(`✓ ${name}`);
      } catch (error) {
        this.failed++;
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        if (error.stack) {
          console.error(`  ${error.stack.split('\n').slice(1, 3).join('\n  ')}`);
        }
      }
    }

    console.log(`\n${this.passed} passed, ${this.failed} failed\n`);
    process.exit(this.failed > 0 ? 1 : 0);
  }
}

const runner = new TestRunner();

// Sample test data
const createItems = () => [
  { itemId: '12345678', tagline: 'Fix login bug', status: 'incomplete', created: '20250101000000000' },
  { itemId: '23456789', tagline: 'Add dashboard feature', status: 'in-progress', created: '20250101000001000' },
  { itemId: '34567890', tagline: 'Update documentation', status: 'completed', created: '20250101000002000' },
  { itemId: '45678901', tagline: 'Refactor authentication', status: 'incomplete', created: '20250101000003000' },
  { itemId: '56789012', tagline: 'Fix dashboard layout', status: 'in-progress', created: '20250101000004000' }
];

// ===== Pending Status Filter Tests =====

runner.test('filterByPendingStatus - all returns all items', () => {
  const items = createItems();
  const pendingIds = new Set(['12345678', '23456789']);

  const result = filterByPendingStatus(items, pendingIds, 'all');

  assertEqual(result.length, 5, 'Should return all 5 items');
});

runner.test('filterByPendingStatus - pending returns only pending items', () => {
  const items = createItems();
  const pendingIds = new Set(['12345678', '45678901']);

  const result = filterByPendingStatus(items, pendingIds, 'pending');

  assertEqual(result.length, 2, 'Should return 2 pending items');
  assert(result.some(i => i.itemId === '12345678'), 'Should include first pending item');
  assert(result.some(i => i.itemId === '45678901'), 'Should include second pending item');
});

runner.test('filterByPendingStatus - not-pending returns non-pending items', () => {
  const items = createItems();
  const pendingIds = new Set(['12345678', '45678901']);

  const result = filterByPendingStatus(items, pendingIds, 'not-pending');

  assertEqual(result.length, 3, 'Should return 3 non-pending items');
  assert(!result.some(i => i.itemId === '12345678'), 'Should not include pending items');
  assert(!result.some(i => i.itemId === '45678901'), 'Should not include pending items');
});

runner.test('filterByPendingStatus - empty pending set with pending filter returns empty', () => {
  const items = createItems();
  const pendingIds = new Set();

  const result = filterByPendingStatus(items, pendingIds, 'pending');

  assertEqual(result.length, 0, 'Should return no items when no items are pending');
});

runner.test('filterByPendingStatus - empty pending set with not-pending returns all', () => {
  const items = createItems();
  const pendingIds = new Set();

  const result = filterByPendingStatus(items, pendingIds, 'not-pending');

  assertEqual(result.length, 5, 'Should return all items when none are pending');
});

runner.test('filterByPendingStatus - all items pending with pending filter returns all', () => {
  const items = createItems();
  const pendingIds = new Set(items.map(i => i.itemId));

  const result = filterByPendingStatus(items, pendingIds, 'pending');

  assertEqual(result.length, 5, 'Should return all items when all are pending');
});

runner.test('filterByPendingStatus - all items pending with not-pending returns empty', () => {
  const items = createItems();
  const pendingIds = new Set(items.map(i => i.itemId));

  const result = filterByPendingStatus(items, pendingIds, 'not-pending');

  assertEqual(result.length, 0, 'Should return no items when all are pending');
});

// ===== Monitor Status Filter Tests =====

runner.test('filterByMonitorStatus - all returns all items', () => {
  const items = createItems();
  const cache = new Map();

  const result = filterByMonitorStatus(items, cache, 'user@example.com', 'all');

  assertEqual(result.length, 5, 'Should return all 5 items');
});

runner.test('filterByMonitorStatus - monitored returns only monitored items', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { monitors: [{ email: 'user@example.com' }] }],
    ['23456789', { monitors: [] }],
    ['34567890', { monitors: [{ email: 'other@example.com' }] }],
    ['45678901', { monitors: [{ email: 'user@example.com' }, { email: 'other@example.com' }] }],
    ['56789012', { monitors: [] }]
  ]);

  const result = filterByMonitorStatus(items, cache, 'user@example.com', 'monitored');

  assertEqual(result.length, 2, 'Should return 2 monitored items');
  assert(result.some(i => i.itemId === '12345678'), 'Should include first monitored item');
  assert(result.some(i => i.itemId === '45678901'), 'Should include second monitored item');
});

runner.test('filterByMonitorStatus - not-monitored returns non-monitored items', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { monitors: [{ email: 'user@example.com' }] }],
    ['23456789', { monitors: [] }],
    ['34567890', { monitors: [{ email: 'other@example.com' }] }],
    ['45678901', { monitors: [{ email: 'user@example.com' }] }],
    ['56789012', { monitors: [] }]
  ]);

  const result = filterByMonitorStatus(items, cache, 'user@example.com', 'not-monitored');

  assertEqual(result.length, 3, 'Should return 3 non-monitored items');
  assert(!result.some(i => i.itemId === '12345678'), 'Should not include monitored items');
  assert(!result.some(i => i.itemId === '45678901'), 'Should not include monitored items');
});

runner.test('filterByMonitorStatus - missing cache entry treated as not monitored', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { monitors: [{ email: 'user@example.com' }] }]
    // Other items not in cache
  ]);

  const result = filterByMonitorStatus(items, cache, 'user@example.com', 'monitored');

  assertEqual(result.length, 1, 'Should only return items with cache entries showing monitoring');
  assertEqual(result[0].itemId, '12345678', 'Should be the cached monitored item');
});

runner.test('filterByMonitorStatus - empty monitors array treated as not monitored', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { monitors: [] }],
    ['23456789', { monitors: [] }]
  ]);

  const result = filterByMonitorStatus(items, cache, 'user@example.com', 'monitored');

  assertEqual(result.length, 0, 'Should return no items when monitors arrays are empty');
});

runner.test('filterByMonitorStatus - case-sensitive email matching', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { monitors: [{ email: 'User@Example.Com' }] }]
  ]);

  // Should NOT match due to case difference
  const result = filterByMonitorStatus(items, cache, 'user@example.com', 'monitored');

  assertEqual(result.length, 0, 'Should not match monitors with different case');
});

runner.test('filterByMonitorStatus - multiple monitors on same item', () => {
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

  assertEqual(result.length, 1, 'Should find item when user is one of multiple monitors');
  assertEqual(result[0].itemId, '12345678', 'Should return the monitored item');
});

// ===== Ignored Status Filter Tests =====

runner.test('filterByIgnoredStatus - all returns all items', () => {
  const items = createItems();
  const cache = new Map();

  const result = filterByIgnoredStatus(items, cache, 'all');

  assertEqual(result.length, 5, 'Should return all 5 items');
});

runner.test('filterByIgnoredStatus - ignored returns only ignored items', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { ignored: true }],
    ['23456789', { ignored: false }],
    ['34567890', { ignored: true }],
    ['45678901', { ignored: false }],
    ['56789012', { ignored: false }]
  ]);

  const result = filterByIgnoredStatus(items, cache, 'ignored');

  assertEqual(result.length, 2, 'Should return 2 ignored items');
  assert(result.some(i => i.itemId === '12345678'), 'Should include first ignored item');
  assert(result.some(i => i.itemId === '34567890'), 'Should include second ignored item');
});

runner.test('filterByIgnoredStatus - not-ignored returns non-ignored items', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { ignored: true }],
    ['23456789', { ignored: false }],
    ['34567890', { ignored: true }],
    ['45678901', { ignored: false }],
    ['56789012', { ignored: false }]
  ]);

  const result = filterByIgnoredStatus(items, cache, 'not-ignored');

  assertEqual(result.length, 3, 'Should return 3 non-ignored items');
  assert(!result.some(i => i.itemId === '12345678'), 'Should not include ignored items');
  assert(!result.some(i => i.itemId === '34567890'), 'Should not include ignored items');
});

runner.test('filterByIgnoredStatus - missing cache entry treated as not ignored', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { ignored: true }]
    // Other items not in cache
  ]);

  const result = filterByIgnoredStatus(items, cache, 'ignored');

  assertEqual(result.length, 1, 'Should only return items with ignored=true');
  assertEqual(result[0].itemId, '12345678', 'Should be the cached ignored item');
});

runner.test('filterByIgnoredStatus - false treated as not ignored', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { ignored: false }],
    ['23456789', { ignored: false }]
  ]);

  const result = filterByIgnoredStatus(items, cache, 'ignored');

  assertEqual(result.length, 0, 'Should return no items when ignored is false');
});

runner.test('filterByIgnoredStatus - undefined treated as not ignored', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { }], // No ignored field
    ['23456789', { ignored: undefined }]
  ]);

  const result = filterByIgnoredStatus(items, cache, 'ignored');

  assertEqual(result.length, 0, 'Should return no items when ignored is undefined');
});

// ===== Taken Status Filter Tests =====

runner.test('filterByTakenStatus - all returns all items', () => {
  const items = createItems();
  const cache = new Map();

  const result = filterByTakenStatus(items, cache, 'all');

  assertEqual(result.length, 5, 'Should return all 5 items');
});

runner.test('filterByTakenStatus - taken returns only taken items', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
    ['23456789', { takenBy: null }],
    ['34567890', { takenBy: { name: 'Bob', email: 'bob@example.com' } }],
    ['45678901', { takenBy: null }],
    ['56789012', { takenBy: null }]
  ]);

  const result = filterByTakenStatus(items, cache, 'taken');

  assertEqual(result.length, 2, 'Should return 2 taken items');
  assert(result.some(i => i.itemId === '12345678'), 'Should include first taken item');
  assert(result.some(i => i.itemId === '34567890'), 'Should include second taken item');
});

runner.test('filterByTakenStatus - not-taken returns non-taken items', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
    ['23456789', { takenBy: null }],
    ['34567890', { takenBy: { name: 'Bob', email: 'bob@example.com' } }],
    ['45678901', { takenBy: null }],
    ['56789012', { takenBy: null }]
  ]);

  const result = filterByTakenStatus(items, cache, 'not-taken');

  assertEqual(result.length, 3, 'Should return 3 non-taken items');
  assert(!result.some(i => i.itemId === '12345678'), 'Should not include taken items');
  assert(!result.some(i => i.itemId === '34567890'), 'Should not include taken items');
});

runner.test('filterByTakenStatus - filter by specific person email', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
    ['23456789', { takenBy: { name: 'Bob', email: 'bob@example.com' } }],
    ['34567890', { takenBy: { name: 'Alice', email: 'alice@example.com' } }],
    ['45678901', { takenBy: { name: 'Charlie', email: 'charlie@example.com' } }],
    ['56789012', { takenBy: null }]
  ]);

  const result = filterByTakenStatus(items, cache, 'alice@example.com');

  assertEqual(result.length, 2, 'Should return items taken by Alice');
  assert(result.some(i => i.itemId === '12345678'), 'Should include first item taken by Alice');
  assert(result.some(i => i.itemId === '34567890'), 'Should include second item taken by Alice');
});

runner.test('filterByTakenStatus - missing cache entry treated as not taken', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }]
    // Other items not in cache
  ]);

  const result = filterByTakenStatus(items, cache, 'taken');

  assertEqual(result.length, 1, 'Should only return items with takenBy set');
  assertEqual(result[0].itemId, '12345678', 'Should be the cached taken item');
});

runner.test('filterByTakenStatus - null takenBy treated as not taken', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { takenBy: null }],
    ['23456789', { takenBy: null }]
  ]);

  const result = filterByTakenStatus(items, cache, 'taken');

  assertEqual(result.length, 0, 'Should return no items when takenBy is null');
});

runner.test('filterByTakenStatus - undefined takenBy treated as not taken', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { }], // No takenBy field
    ['23456789', { takenBy: undefined }]
  ]);

  const result = filterByTakenStatus(items, cache, 'taken');

  assertEqual(result.length, 0, 'Should return no items when takenBy is undefined');
});

runner.test('filterByTakenStatus - case-sensitive email matching', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { takenBy: { name: 'Alice', email: 'Alice@Example.Com' } }]
  ]);

  // Should NOT match due to case difference
  const result = filterByTakenStatus(items, cache, 'alice@example.com');

  assertEqual(result.length, 0, 'Should not match takers with different case email');
});

runner.test('filterByTakenStatus - only one taker per item', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { takenBy: { name: 'Alice', email: 'alice@example.com' } }]
  ]);

  const result = filterByTakenStatus(items, cache, 'alice@example.com');

  assertEqual(result.length, 1, 'Should find item taken by specific person');
  assertEqual(result[0].itemId, '12345678', 'Should return the taken item');
  assertEqual(typeof cache.get('12345678').takenBy, 'object', 'takenBy should be object not array');
});

// ===== Text Search Filter Tests =====

runner.test('filterByText - empty string returns all items', () => {
  const items = createItems();

  const result = filterByText(items, '');

  assertEqual(result.length, 5, 'Should return all items for empty search');
});

runner.test('filterByText - whitespace-only returns all items', () => {
  const items = createItems();

  const result = filterByText(items, '   ');

  assertEqual(result.length, 5, 'Should return all items for whitespace-only search');
});

runner.test('filterByText - search by full itemId', () => {
  const items = createItems();

  const result = filterByText(items, '12345678');

  assertEqual(result.length, 1, 'Should return 1 item');
  assertEqual(result[0].itemId, '12345678', 'Should match by itemId');
});

runner.test('filterByText - search by partial itemId', () => {
  const items = createItems();

  const result = filterByText(items, '234');

  // Should match '12345678' and '23456789'
  assertEqual(result.length, 2, 'Should return items with matching itemId substring');
  assert(result.some(i => i.itemId === '12345678'), 'Should match first item');
  assert(result.some(i => i.itemId === '23456789'), 'Should match second item');
});

runner.test('filterByText - search is case-insensitive', () => {
  const items = [
    { itemId: 'ABC12345', tagline: 'Test Item', status: 'incomplete' }
  ];

  const result1 = filterByText(items, 'abc');
  assertEqual(result1.length, 1, 'Should match itemId case-insensitively');

  const result2 = filterByText(items, 'TEST');
  assertEqual(result2.length, 1, 'Should match tagline case-insensitively');
});

runner.test('filterByText - search in tagline', () => {
  const items = createItems();

  const result = filterByText(items, 'login');

  assertEqual(result.length, 1, 'Should return 1 item with "login" in tagline');
  assertEqual(result[0].tagline, 'Fix login bug', 'Should match by tagline');
});

runner.test('filterByText - search matches both itemId and tagline', () => {
  const items = createItems();

  const result = filterByText(items, 'dashboard');

  // Should match '23456789' (has "dashboard" in tagline) and '56789012' (has "dashboard" in tagline)
  assertEqual(result.length, 2, 'Should match items with "dashboard" in tagline');
});

runner.test('filterByText - search matches partial words in tagline', () => {
  const items = createItems();

  const result = filterByText(items, 'doc');

  assertEqual(result.length, 1, 'Should match partial word in tagline');
  assertEqual(result[0].tagline, 'Update documentation', 'Should match "documentation"');
});

runner.test('filterByText - search with spaces', () => {
  const items = createItems();

  const result = filterByText(items, 'login bug');

  assertEqual(result.length, 1, 'Should match phrase in tagline');
  assertEqual(result[0].tagline, 'Fix login bug', 'Should match complete phrase');
});

runner.test('filterByText - search with special characters', () => {
  const items = [
    { itemId: '12345678', tagline: 'Fix bug!', status: 'incomplete' }
  ];

  const result = filterByText(items, 'bug!');

  assertEqual(result.length, 1, 'Should match special characters in tagline');
});

runner.test('filterByText - no matches returns empty array', () => {
  const items = createItems();

  const result = filterByText(items, 'nonexistent');

  assertEqual(result.length, 0, 'Should return empty array when no matches');
});

runner.test('filterByText - trims whitespace from search text', () => {
  const items = createItems();

  const result = filterByText(items, '  login  ');

  assertEqual(result.length, 1, 'Should trim whitespace and match');
});

// ===== Combined Filter Tests =====

runner.test('applyAllFilters - no filters returns all items', () => {
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

  assertEqual(result.length, 5, 'Should return all items');
});

runner.test('applyAllFilters - pending filter only', () => {
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

  assertEqual(result.length, 2, 'Should filter by pending status');
});

runner.test('applyAllFilters - monitor filter only', () => {
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

  assertEqual(result.length, 1, 'Should filter by monitor status');
  assertEqual(result[0].itemId, '12345678', 'Should return monitored item');
});

runner.test('applyAllFilters - text filter only', () => {
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

  assertEqual(result.length, 2, 'Should filter by text search');
  assert(result.every(i => (i.itemId + i.tagline).toLowerCase().includes('dashboard')), 'All results should have dashboard in itemId or tagline');
});

runner.test('applyAllFilters - pending AND text filters', () => {
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

  // Only '23456789' is both pending AND has "dashboard" in tagline
  assertEqual(result.length, 1, 'Should apply both filters with AND logic');
  assertEqual(result[0].itemId, '23456789', 'Should match item that passes both filters');
});

runner.test('applyAllFilters - monitor AND text filters', () => {
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

  // Only '56789012' is both monitored AND has "dashboard" in tagline
  assertEqual(result.length, 1, 'Should apply both filters with AND logic');
  assertEqual(result[0].itemId, '56789012', 'Should match item that passes both filters');
});

runner.test('applyAllFilters - all three filters combined', () => {
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

  // '23456789' and '56789012' are pending AND monitored AND have "dashboard", but '23456789' also passes text
  assertEqual(result.length, 2, 'Should apply all three filters with AND logic');
  const resultIds = result.map(i => i.itemId).sort();
  assertArrayEqual(resultIds, ['23456789', '56789012'], 'Should match items that pass all filters');
});

runner.test('applyAllFilters - filters that result in empty set', () => {
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

  assertEqual(result.length, 0, 'Should return empty array when no items pass all filters');
});

runner.test('applyAllFilters - handles missing options gracefully', () => {
  const items = createItems();
  const options = {}; // No options provided

  const result = applyAllFilters(items, options);

  assertEqual(result.length, 5, 'Should return all items with default filter values');
});

runner.test('applyAllFilters - preserves item order', () => {
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

  assertArrayEqual(
    result.map(i => i.itemId),
    items.map(i => i.itemId),
    'Should preserve original item order'
  );
});

runner.test('applyAllFilters - applies ignored filter', () => {
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

  assertEqual(result.length, 3, 'Should filter out ignored items');
  assert(!result.some(i => i.itemId === '12345678'), 'Should exclude ignored items');
  assert(!result.some(i => i.itemId === '34567890'), 'Should exclude ignored items');
});

runner.test('applyAllFilters - defaults to not-ignored filter', () => {
  const items = createItems();
  const cache = new Map([
    ['12345678', { ignored: true }]
  ]);

  const options = {
    itemDetailsCache: cache
    // ignoredFilter not specified - should default to 'not-ignored'
  };

  const result = applyAllFilters(items, options);

  assert(!result.some(i => i.itemId === '12345678'), 'Should exclude ignored items by default');
});

runner.test('applyAllFilters - applies taken filter', () => {
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

  assertEqual(result.length, 2, 'Should filter to only taken items');
  assert(result.some(i => i.itemId === '12345678'), 'Should include taken items');
  assert(result.some(i => i.itemId === '34567890'), 'Should include taken items');
});

runner.test('applyAllFilters - taken filter by specific person', () => {
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

  assertEqual(result.length, 2, 'Should filter to items taken by Alice');
  assert(result.some(i => i.itemId === '12345678'), 'Should include Alice items');
  assert(result.some(i => i.itemId === '34567890'), 'Should include Alice items');
  assert(!result.some(i => i.itemId === '23456789'), 'Should not include Bob items');
});

runner.test('applyAllFilters - pending AND taken filters', () => {
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

  // Only items that are BOTH pending AND taken
  assertEqual(result.length, 2, 'Should apply both pending and taken filters');
  assert(result.some(i => i.itemId === '12345678'), 'Should include pending+taken items');
  assert(result.some(i => i.itemId === '23456789'), 'Should include pending+taken items');
  assert(!result.some(i => i.itemId === '45678901'), 'Should exclude pending but not-taken items');
});

// Run all tests
runner.run();
