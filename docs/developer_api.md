# Sparkle Developer API Manual

Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.

This manual explains how developers can integrate with Sparkle programmatically. There are two APIs available:

1. **JavaScript Module API** (`sparkle.js`) - For Node.js applications that want to use Sparkle as a library
2. **HTTP REST API** (Agent/Daemon) - For any application that wants to communicate with the Sparkle daemon over HTTP

## Table of Contents

- [Part A: JavaScript Module API](#part-a-javascript-module-api)
  - [Installation and Import](#installation-and-import)
  - [Configuration](#configuration)
  - [Items](#items)
  - [Dependencies](#dependencies)
  - [Monitoring](#monitoring)
  - [Queries](#queries)
  - [Statuses](#statuses)
- [Part B: HTTP REST API](#part-b-http-rest-api)
  - [Overview](#overview)
  - [Connection](#connection)
  - [Endpoints Reference](#endpoints-reference)
  - [Server-Sent Events](#server-sent-events)
  - [Error Handling](#error-handling)

---

# Part A: JavaScript Module API

The JavaScript module API (`sparkle.js`) is the core library that provides programmatic access to all Sparkle functionality. Use this when integrating Sparkle directly into a Node.js application.

## Installation and Import

### Installation

Sparkle is distributed as an npm package:

```bash
npm install --save-dev ./sparkle-1.0.78.tgz
```

### Import

```javascript
import * as sparkle from 'sparkle';

// Or import specific functions
import { createItem, addDependency, getAllItems } from 'sparkle';
```

### ES Module Requirement

Sparkle is an ES module. Your project must use ES modules:

```json
{
  "type": "module"
}
```

---

## Configuration

### Setting Base Directory

By default, Sparkle stores data in `./sparkle-data`. You can change this:

```javascript
import { setBaseDirectory, getBaseDirectory } from 'sparkle';

// Set custom directory
setBaseDirectory('/path/to/my/data');

// Get current directory
const dir = getBaseDirectory();
console.log(dir); // '/path/to/my/data'
```

**Use cases:**
- Testing (create isolated test directories)
- Multi-project setups
- Custom storage locations

**Important:** Set the base directory before calling any other API functions.

---

## Items

### createItem()

Creates a new item and returns its unique ID.

**Signature:**
```javascript
async function createItem(tagline, status = 'incomplete', initialEntry)
```

**Parameters:**
- `tagline` (string, required): Short description of the item
- `status` (string, optional): Initial status (default: `'incomplete'`)
- `initialEntry` (string, optional): Optional initial note/entry

**Returns:** `Promise<string>` - The 8-digit item ID

**Example:**
```javascript
const item1 = await sparkle.createItem('Fix login bug');
console.log(item1); // '12345678'

const item2 = await sparkle.createItem(
  'Implement user dashboard',
  'in-progress',
  'Requirements gathered from product team'
);
```

**Errors:**
- `Error: Tagline cannot be empty or whitespace`
- `Error: Cannot create an item with status "completed"`
- `Error: Invalid status` (if statuses.json exists and status is not allowed)

---

### getItemDetails()

Retrieves complete information about an item.

**Signature:**
```javascript
async function getItemDetails(itemId)
```

**Parameters:**
- `itemId` (string, required): The item identifier

**Returns:** `Promise<Object>` - Deep copy of item details

**Example:**
```javascript
const details = await sparkle.getItemDetails('12345678');
console.log(details);
// {
//   itemId: '12345678',
//   tagline: 'Fix login bug',
//   status: 'in-progress',
//   creator: { name: 'John Doe', email: 'john@example.com', timestamp: '...' },
//   created: '20250122103045123',
//   dependencies: ['23456789'],
//   monitors: [{ name: 'Jane Smith', email: 'jane@example.com' }],
//   entries: [
//     { text: 'Reproduced the bug...', person: {...}, timestamp: '...' }
//   ]
// }
```

**Properties:**
- `itemId`: Unique identifier
- `tagline`: Current tagline
- `status`: Current status
- `creator`: Person who created the item
- `created`: Creation timestamp
- `dependencies`: Array of item IDs this depends on
- `monitors`: Array of people monitoring this item
- `entries`: Array of all entries (notes)

**Errors:**
- `Error: Item {itemId} does not exist`

---

### alterTagline()

Updates the item's tagline.

**Signature:**
```javascript
async function alterTagline(itemId, tagline)
```

**Parameters:**
- `itemId` (string, required): The item identifier
- `tagline` (string, required): New tagline

**Returns:** `Promise<void>`

**Example:**
```javascript
await sparkle.alterTagline('12345678', 'Fix critical login bug (P0)');
```

**Errors:**
- `Error: Tagline cannot be empty or whitespace`
- `Error: Item {itemId} does not exist`

**Note:** Tagline history is preserved internally in separate files.

---

### addEntry()

Adds a note or comment to an item.

**Signature:**
```javascript
async function addEntry(itemId, text)
```

**Parameters:**
- `itemId` (string, required): The item identifier
- `text` (string, required): Entry text content

**Returns:** `Promise<void>`

**Example:**
```javascript
await sparkle.addEntry('12345678', 'Discovered root cause: session timeout not refreshing');
await sparkle.addEntry('12345678', 'Implemented fix, waiting for code review');
```

**Errors:**
- `Error: Item {itemId} does not exist`

**Notes:**
- Entries are append-only and immutable
- Each entry includes author information and timestamp
- All entries are visible in chronological order via `getItemDetails()`

---

### updateStatus()

Changes the status of an item.

**Signature:**
```javascript
async function updateStatus(itemId, status, text = '')
```

**Parameters:**
- `itemId` (string, required): The item identifier
- `status` (string, required): New status value
- `text` (string, optional): Explanation for the status change

**Returns:** `Promise<void>`

**Example:**
```javascript
await sparkle.updateStatus('12345678', 'in-progress', 'Started working on this');
await sparkle.updateStatus('12345678', 'completed', 'All done and tested');
```

**Errors:**
- `Error: Item {itemId} does not exist`
- `Error: Cannot complete item {itemId}: dependency {depId} is not completed`
- `Error: Invalid status` (if statuses.json exists and status is not allowed)

**Notes:**
- Cannot mark an item as `'completed'` if it has incomplete dependencies
- Status history is preserved internally
- Common statuses: `'incomplete'`, `'completed'`, `'in-progress'`, `'unassigned'`, `'blocked'`

---

## Dependencies

### addDependency()

Creates a dependency relationship where one item depends on another.

**Signature:**
```javascript
async function addDependency(itemNeeding, itemNeeded)
```

**Parameters:**
- `itemNeeding` (string, required): Item that has the dependency
- `itemNeeded` (string, required): Item that must be completed first

**Returns:** `Promise<void>`

**Example:**
```javascript
// Deployment depends on testing
await sparkle.addDependency(deploymentItem, testingItem);

// Testing depends on implementation
await sparkle.addDependency(testingItem, implementationItem);

// Result: implementation → testing → deployment
```

**Errors:**
- `Error: Item {itemId} does not exist`
- `Error: Adding dependency would create a cycle`

**Behavior:**
- **Idempotent**: Adding an existing dependency is safely ignored
- **Cycle detection**: Throws error if this would create a circular dependency
- **Status propagation**: If `itemNeeding` is completed, it gets marked incomplete
- **Transitive propagation**: Items depending on `itemNeeding` also become incomplete
- Dependencies form a DAG (Directed Acyclic Graph)

**Example with status propagation:**
```javascript
const impl = await sparkle.createItem('Implementation');
const test = await sparkle.createItem('Testing');

// Complete both items
await sparkle.updateStatus(impl, 'completed');
await sparkle.updateStatus(test, 'completed');

// Add dependency: test depends on impl
await sparkle.addDependency(test, impl);
// Result: test is still completed (impl is completed, so dependency is met)

// Now add: impl depends on a new incomplete item
const review = await sparkle.createItem('Code review');
await sparkle.addDependency(impl, review);
// Result: impl → incomplete, test → incomplete (transitive)
```

---

### removeDependency()

Removes a dependency relationship.

**Signature:**
```javascript
async function removeDependency(itemNeeding, itemNeeded)
```

**Parameters:**
- `itemNeeding` (string, required): Item that has the dependency
- `itemNeeded` (string, required): Item to remove from dependencies

**Returns:** `Promise<void>`

**Example:**
```javascript
await sparkle.removeDependency(deploymentItem, testingItem);
```

**Errors:**
- `Error: Item {itemId} does not exist`

**Behavior:**
- **Idempotent**: Removing a non-existent dependency is safely ignored (no error)
- Does not change item statuses
- Dependency history is preserved internally

---

### getPotentialDependencies()

Gets candidate items that can be added as dependencies, plus current dependencies.

**Signature:**
```javascript
async function getPotentialDependencies(itemId)
```

**Parameters:**
- `itemId` (string, required): The item identifier

**Returns:** `Promise<Object>` with shape:
```javascript
{
  candidates: [
    { itemId: '23456789', tagline: 'Item B', status: 'incomplete' }
  ],
  current: [
    { itemId: '34567890', tagline: 'Item C', status: 'completed' }
  ]
}
```

**Example:**
```javascript
const result = await sparkle.getPotentialDependencies('12345678');
console.log('Can add as dependencies:', result.candidates);
console.log('Already dependencies:', result.current);
```

**Notes:**
- `candidates` excludes items that would create a cycle
- `candidates` excludes the item itself
- `candidates` excludes items already in `current`

---

### getPotentialDependents()

Gets candidate items that can depend on this item (inverse of dependencies).

**Signature:**
```javascript
async function getPotentialDependents(itemId)
```

**Parameters:**
- `itemId` (string, required): The item identifier

**Returns:** `Promise<Object>` with shape:
```javascript
{
  candidates: [
    { itemId: '23456789', tagline: 'Item B', status: 'incomplete' }
  ],
  current: [
    { itemId: '45678901', tagline: 'Item D', status: 'in-progress' }
  ]
}
```

**Example:**
```javascript
const result = await sparkle.getPotentialDependents('12345678');
console.log('Can be needed by:', result.candidates);
console.log('Already needed by:', result.current);
```

---

## Monitoring

### addMonitor()

Makes the current user a monitor of the item.

**Signature:**
```javascript
async function addMonitor(itemId)
```

**Parameters:**
- `itemId` (string, required): The item identifier

**Returns:** `Promise<void>`

**Example:**
```javascript
await sparkle.addMonitor('12345678');
```

**Errors:**
- `Error: Item {itemId} does not exist`

**Notes:**
- **Idempotent**: Adding when already monitoring is safely ignored
- Uses git user identity to identify the person
- Cannot force someone else to monitor (only yourself)

---

### removeMonitor()

Stops the current user from monitoring the item.

**Signature:**
```javascript
async function removeMonitor(itemId)
```

**Parameters:**
- `itemId` (string, required): The item identifier

**Returns:** `Promise<void>`

**Example:**
```javascript
await sparkle.removeMonitor('12345678');
```

**Errors:**
- `Error: Item {itemId} does not exist`

**Notes:**
- **Idempotent**: Removing when not monitoring is safely ignored
- Can add and remove monitoring as many times as desired

---

### ignoreItem()

Marks an item as ignored. Ignored items are hidden by default in list views but remain in the system.

**Signature:**
```javascript
async function ignoreItem(itemId)
```

**Parameters:**
- `itemId` (string, required): The 8-digit item identifier

**Example:**
```javascript
await sparkle.ignoreItem('12345678');
```

**Errors:**
- `Error: Item {itemId} does not exist`

**Notes:**
- **Idempotent**: Ignoring an already-ignored item is safely ignored
- Ignored items still appear in monitor view if monitored
- Ignoring does not change item status (completed/incomplete remain unchanged)
- List views default to hiding ignored items

---

### unignoreItem()

Removes the ignored flag from an item, making it visible again in list views.

**Signature:**
```javascript
async function unignoreItem(itemId)
```

**Parameters:**
- `itemId` (string, required): The 8-digit item identifier

**Example:**
```javascript
await sparkle.unignoreItem('12345678');
```

**Errors:**
- `Error: Item {itemId} does not exist`

**Notes:**
- **Idempotent**: Un-ignoring an item that isn't ignored is safely ignored
- Item becomes visible in default list views again
- All audit trail history preserved

---

## Queries

### pendingWork()

Returns an async generator that yields item IDs for work that is ready to be done.

An item is considered pending work if:
1. It is not completed
2. All of its dependencies are completed (or it has no dependencies)

**Signature:**
```javascript
async function* pendingWork()
```

**Returns:** `AsyncGenerator<string>` - Yields item IDs

**Example:**
```javascript
// Get all items ready to work on
for await (const itemId of sparkle.pendingWork()) {
  const details = await sparkle.getItemDetails(itemId);
  console.log(`Ready to work on: ${details.tagline}`);
}

// Or collect into an array
const pending = [];
for await (const itemId of sparkle.pendingWork()) {
  pending.push(itemId);
}
console.log(`${pending.length} items ready for work`);
```

**Notes:**
- Only returns items that have all dependencies met
- Excludes completed items
- Items with no dependencies are always included (unless completed)
- Useful for finding the "next thing to do" in a dependency graph
- Returns items in no particular order

---

### getAllItems()

Gets a list of all items with basic information.

**Signature:**
```javascript
async function getAllItems()
```

**Returns:** `Promise<Array<Object>>` - Array of items with shape:
```javascript
[
  {
    itemId: '12345678',
    tagline: 'Fix login bug',
    status: 'in-progress',
    created: '20250122103045123'
  },
  ...
]
```

**Example:**
```javascript
const items = await sparkle.getAllItems();
console.log(`Total items: ${items.length}`);
items.forEach(item => {
  console.log(`${item.itemId}: ${item.tagline} (${item.status})`);
});
```

**Notes:**
- Returns basic info only (no dependencies, entries, etc.)
- For complete details, use `getItemDetails(itemId)` for each item
- Sorted by creation time (newest first)

---

### getAllItemsAsDag()

Returns an async generator that yields DAG structure for all items.

**Signature:**
```javascript
async function* getAllItemsAsDag()
```

**Returns:** `AsyncGenerator<Object>` - Yields objects with shape:
```javascript
{
  itemId: '12345678',
  tagline: 'Fix login bug',
  status: 'in-progress',
  created: '20250122103045123',
  dependencies: ['23456789', '34567890'],
  dependents: ['45678901']
}
```

**Example:**
```javascript
for await (const item of sparkle.getAllItemsAsDag()) {
  console.log(`${item.itemId}: ${item.tagline}`);
  console.log(`  Depends on: ${item.dependencies.join(', ') || 'none'}`);
  console.log(`  Needed by: ${item.dependents.join(', ') || 'none'}`);
}
```

**Notes:**
- Useful for building custom visualizations
- Includes both dependencies and dependents for each item
- Generators are memory-efficient for large datasets

---

### getItemAuditTrail()

Returns an async generator that yields audit trail events for an item.

**Signature:**
```javascript
async function* getItemAuditTrail(itemId)
```

**Returns:** `AsyncGenerator<Object>` - Yields audit events

**Example:**
```javascript
for await (const event of sparkle.getItemAuditTrail('12345678')) {
  console.log(event);
  // {
  //   type: 'status',
  //   timestamp: '20250122103045123',
  //   person: { name: '...', email: '...' },
  //   status: 'in-progress',
  //   text: 'Started working on this'
  // }
}
```

**Event types:**
- `creation` - Item created
- `tagline` - Tagline changed
- `status` - Status changed
- `entry` - Entry added
- `dependency` - Dependency added/removed
- `monitor` - Monitor added/removed
- `ignored` - Item ignored/un-ignored

**Notes:**
- Events are in chronological order
- Each event includes person who made the change and timestamp

---

## Statuses

### getAllowedStatuses()

Gets the list of all allowed status values.

**Signature:**
```javascript
async function getAllowedStatuses()
```

**Returns:** `Promise<Array<string>>` - Sorted array of status names

**Example:**
```javascript
const statuses = await sparkle.getAllowedStatuses();
console.log(statuses);
// ['blocked', 'completed', 'in-progress', 'incomplete', 'review']
```

**Notes:**
- Always includes `'incomplete'` and `'completed'`
- If `statuses.json` exists, includes custom statuses
- If no `statuses.json`, returns only `['incomplete', 'completed']`
- Sorted alphabetically

---

### updateStatuses()

Updates the allowed statuses file with custom statuses.

**Signature:**
```javascript
async function updateStatuses(statuses)
```

**Parameters:**
- `statuses` (Array<string>, required): Array of custom status names

**Returns:** `Promise<void>`

**Example:**
```javascript
await sparkle.updateStatuses(['in-progress', 'blocked', 'review', 'on-hold']);

// Now these statuses are available
const item = await sparkle.createItem('New task', 'in-progress');
```

**Errors:**
- `Error: Statuses must be an array`
- `Error: All statuses must be non-empty strings`
- `Error: Cannot add or remove mandatory statuses: incomplete, completed`

**Notes:**
- Only custom statuses are saved to `statuses.json`
- `'incomplete'` and `'completed'` are always allowed
- Duplicates are automatically removed
- Whitespace is trimmed from status names

---

# Part B: HTTP REST API

The HTTP REST API is provided by the Sparkle daemon (agent) and allows any application to interact with Sparkle over HTTP.

## Overview

**Protocol:** HTTP/1.1
**Format:** JSON request/response
**Base URL:** `http://localhost:{port}`
**Port:** Dynamically assigned, stored in `.sparkle-worktree/sparkle-data/last_port.data`

### When to use HTTP API

- Integration from non-Node.js applications
- Web applications (JavaScript in browser)
- Microservices architecture
- Remote access to Sparkle daemon
- When you can't import the JavaScript module directly

---

## Connection

### Finding the Port

The daemon writes its port to a file:

```bash
cat .sparkle-worktree/sparkle-data/last_port.data
# Output: 62781
```

**In code:**
```javascript
import { readFileSync } from 'fs';

const port = readFileSync('.sparkle-worktree/sparkle-data/last_port.data', 'utf8').trim();
const baseUrl = `http://localhost:${port}`;
```

### Starting the Daemon

```bash
npx sparkle-daemon
```

The daemon runs in the background and auto-shuts down after 60 seconds with no connected clients.

---

## Endpoints Reference

### Health Check

#### `GET /api/ping`

Check if the daemon is alive.

**Request:**
```bash
curl http://localhost:62781/api/ping
```

**Response:**
```json
{
  "status": "ok"
}
```

---

#### `GET /api/version`

Get Sparkle version.

**Request:**
```bash
curl http://localhost:62781/api/version
```

**Response:**
```json
{
  "version": "1.0.78"
}
```

---

### Configuration

#### `POST /api/configure`

Configure Sparkle (first-time setup only).

**Request:**
```bash
curl -X POST http://localhost:62781/api/configure \
  -H "Content-Type: application/json" \
  -d '{
    "git_branch": "sparkle-data",
    "directory": "sparkle-data",
    "fetchIntervalMinutes": 10
  }'
```

**Response:**
```json
{
  "success": true
}
```

**Notes:**
- Called automatically by configuration UI
- Only works if no configuration exists
- Saves to `package.json`

---

### Status and Sync

#### `GET /api/status`

Get current Sparkle status.

**Request:**
```bash
curl http://localhost:62781/api/status
```

**Response:**
```json
{
  "branch": "sparkle-data",
  "directory": "sparkle-data",
  "version": "1.0.78",
  "gitAvailable": true,
  "lastChangeTimestamp": 1737553234567,
  "lastChangeSHA": "abc123def456..."
}
```

---

#### `GET /api/getLastChange`

Get timestamp and SHA of last change.

**Request:**
```bash
curl http://localhost:62781/api/getLastChange
```

**Response:**
```json
{
  "timestamp": 1737553234567,
  "sha": "abc123def456..."
}
```

---

#### `POST /api/fetch`

Manually trigger fetch from remote repository.

**Request:**
```bash
curl -X POST http://localhost:62781/api/fetch
```

**Response:**
```json
{
  "changed": true,
  "sha": "abc123def456..."
}
```

**Notes:**
- Returns immediately (fetch happens async)
- Subscribe to SSE `/api/events` to get fetch completion notification

---

### Items

#### `POST /api/createItem`

Create a new item.

**Request:**
```bash
curl -X POST http://localhost:62781/api/createItem \
  -H "Content-Type: application/json" \
  -d '{
    "tagline": "Fix login bug",
    "status": "incomplete",
    "initialEntry": "Reported by customer"
  }'
```

**Response:**
```json
{
  "itemId": "12345678"
}
```

**Body parameters:**
- `tagline` (string, required): Item description
- `status` (string, optional): Initial status (default: 'incomplete')
- `initialEntry` (string, optional): Optional first entry

---

#### `POST /api/getItemDetails`

Get complete details for an item.

**Request:**
```bash
curl -X POST http://localhost:62781/api/getItemDetails \
  -H "Content-Type: application/json" \
  -d '{ "itemId": "12345678" }'
```

**Response:**
```json
{
  "itemId": "12345678",
  "tagline": "Fix login bug",
  "status": "in-progress",
  "creator": {
    "name": "John Doe",
    "email": "john@example.com",
    "timestamp": "20250122103045123"
  },
  "created": "20250122103045123",
  "dependencies": ["23456789"],
  "monitors": [
    { "name": "Jane Smith", "email": "jane@example.com" }
  ],
  "entries": [
    {
      "text": "Reproduced the bug",
      "person": { "name": "John Doe", "email": "john@example.com" },
      "timestamp": "20250122104523456"
    }
  ]
}
```

---

#### `POST /api/updateTagline`

Update item tagline.

**Request:**
```bash
curl -X POST http://localhost:62781/api/updateTagline \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "12345678",
    "tagline": "Fix critical login bug (P0)"
  }'
```

**Response:**
```json
{
  "success": true
}
```

**Note:** `POST /api/alterTagline` is deprecated, use `updateTagline` instead.

---

#### `POST /api/addEntry`

Add an entry (note) to an item.

**Request:**
```bash
curl -X POST http://localhost:62781/api/addEntry \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "12345678",
    "text": "Found root cause in session handler"
  }'
```

**Response:**
```json
{
  "success": true
}
```

---

#### `POST /api/updateStatus`

Update item status.

**Request:**
```bash
curl -X POST http://localhost:62781/api/updateStatus \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "12345678",
    "status": "completed",
    "text": "Fixed and tested"
  }'
```

**Response:**
```json
{
  "success": true
}
```

**Body parameters:**
- `itemId` (string, required)
- `status` (string, required)
- `text` (string, optional): Explanation for status change

---

### Dependencies

#### `POST /api/addDependency`

Add a dependency relationship.

**Request:**
```bash
curl -X POST http://localhost:62781/api/addDependency \
  -H "Content-Type: application/json" \
  -d '{
    "itemNeeding": "12345678",
    "itemNeeded": "23456789"
  }'
```

**Response:**
```json
{
  "success": true
}
```

**Body parameters:**
- `itemNeeding` (string, required): Item that depends
- `itemNeeded` (string, required): Item that is depended on

---

#### `POST /api/removeDependency`

Remove a dependency relationship.

**Request:**
```bash
curl -X POST http://localhost:62781/api/removeDependency \
  -H "Content-Type: application/json" \
  -d '{
    "itemNeeding": "12345678",
    "itemNeeded": "23456789"
  }'
```

**Response:**
```json
{
  "success": true
}
```

---

#### `POST /api/getPotentialDependencies`

Get candidate and current dependencies for an item.

**Request:**
```bash
curl -X POST http://localhost:62781/api/getPotentialDependencies \
  -H "Content-Type: application/json" \
  -d '{ "itemId": "12345678" }'
```

**Response:**
```json
{
  "candidates": [
    { "itemId": "23456789", "tagline": "Item B", "status": "incomplete" }
  ],
  "current": [
    { "itemId": "34567890", "tagline": "Item C", "status": "completed" }
  ]
}
```

---

#### `POST /api/getPotentialDependents`

Get candidate and current dependents for an item.

**Request:**
```bash
curl -X POST http://localhost:62781/api/getPotentialDependents \
  -H "Content-Type: application/json" \
  -d '{ "itemId": "12345678" }'
```

**Response:**
```json
{
  "candidates": [
    { "itemId": "45678901", "tagline": "Item D", "status": "in-progress" }
  ],
  "current": [
    { "itemId": "56789012", "tagline": "Item E", "status": "incomplete" }
  ]
}
```

---

### Monitoring

#### `POST /api/addMonitor`

Add current user as monitor.

**Request:**
```bash
curl -X POST http://localhost:62781/api/addMonitor \
  -H "Content-Type: application/json" \
  -d '{ "itemId": "12345678" }'
```

**Response:**
```json
{
  "success": true
}
```

---

#### `POST /api/removeMonitor`

Remove current user as monitor.

**Request:**
```bash
curl -X POST http://localhost:62781/api/removeMonitor \
  -H "Content-Type: application/json" \
  -d '{ "itemId": "12345678" }'
```

**Response:**
```json
{
  "success": true
}
```

---

#### `POST /api/ignoreItem`

Mark an item as ignored (hide from default list views).

**Request:**
```bash
curl -X POST http://localhost:62781/api/ignoreItem \
  -H "Content-Type: application/json" \
  -d '{ "itemId": "12345678" }'
```

**Response:**
```json
{
  "success": true
}
```

**Notes:**
- Idempotent operation
- Ignored items still visible in monitor view if monitored
- Creates git commit automatically

---

#### `POST /api/unignoreItem`

Remove ignore flag from an item (make visible in list views).

**Request:**
```bash
curl -X POST http://localhost:62781/api/unignoreItem \
  -H "Content-Type: application/json" \
  -d '{ "itemId": "12345678" }'
```

**Response:**
```json
{
  "success": true
}
```

**Notes:**
- Idempotent operation
- Creates git commit automatically

---

### Queries

#### `GET /api/pendingWork`

Stream pending work items (items ready to work on).

**Request:**
```bash
curl http://localhost:62781/api/pendingWork
```

**Response:** (streaming JSON, one per line)
```json
{"itemId":"12345678","tagline":"Fix login bug","status":"incomplete","created":"20250122103045123"}
{"itemId":"23456789","tagline":"Write docs","status":"incomplete","created":"20250122110000000"}
```

**Notes:**
- Response is streamed (not a JSON array)
- Each line is a complete JSON object
- Parse line-by-line

---

#### `GET /api/allItems`

Get all items as JSON array.

**Request:**
```bash
curl http://localhost:62781/api/allItems
```

**Response:**
```json
[
  {
    "itemId": "12345678",
    "tagline": "Fix login bug",
    "status": "in-progress",
    "created": "20250122103045123"
  },
  ...
]
```

---

#### `GET /api/dag`

Stream DAG structure for all items.

**Request:**
```bash
curl http://localhost:62781/api/dag
```

**Response:** (streaming JSON, one per line)
```json
{"itemId":"12345678","tagline":"Fix login bug","status":"in-progress","created":"20250122103045123","dependencies":["23456789"],"dependents":["34567890"]}
```

**Notes:**
- Response is streamed
- Each line includes dependencies and dependents arrays

---

#### `POST /api/getItemAuditTrail`

Get audit trail for an item.

**Request:**
```bash
curl -X POST http://localhost:62781/api/getItemAuditTrail \
  -H "Content-Type: application/json" \
  -d '{ "itemId": "12345678" }'
```

**Response:** (streaming JSON, one event per line)
```json
{"type":"creation","timestamp":"20250122103045123","person":{"name":"John Doe","email":"john@example.com"},"tagline":"Fix login bug","status":"incomplete"}
{"type":"status","timestamp":"20250122104523456","person":{"name":"John Doe","email":"john@example.com"},"status":"in-progress","text":"Started working"}
```

---

### Statuses

#### `GET /api/allowedStatuses`

Get list of allowed status values.

**Request:**
```bash
curl http://localhost:62781/api/allowedStatuses
```

**Response:**
```json
["blocked", "completed", "in-progress", "incomplete", "review"]
```

---

#### `POST /api/updateStatuses`

Update custom status values.

**Request:**
```bash
curl -X POST http://localhost:62781/api/updateStatuses \
  -H "Content-Type: application/json" \
  -d '{
    "statuses": ["in-progress", "blocked", "review"]
  }'
```

**Response:**
```json
{
  "success": true
}
```

---

### Server Control

#### `POST /api/shutdown`

Gracefully shut down the daemon.

**Request:**
```bash
curl -X POST http://localhost:62781/api/shutdown
```

**Response:**
```json
{
  "message": "Server shutting down"
}
```

**Notes:**
- Commits any pending changes
- Closes all connections
- Daemon exits cleanly

---

#### `POST /api/clientLog`

Log a message from client (for debugging).

**Request:**
```bash
curl -X POST http://localhost:62781/api/clientLog \
  -H "Content-Type: application/json" \
  -d '{
    "level": "info",
    "message": "User clicked button"
  }'
```

**Response:**
```json
{
  "success": true
}
```

**Notes:**
- Logs appear in daemon console
- Useful for debugging web UI

---

## Server-Sent Events

The daemon provides real-time updates via Server-Sent Events (SSE).

### Endpoint

#### `GET /api/events`

Subscribe to real-time event stream.

**Request:**
```bash
curl http://localhost:62781/api/events
```

**Response:** (event stream, continuous)
```
event: connected
data: {"message":"Connected to Sparkle"}

event: heartbeat
data: {"timestamp":1737553234567}

event: dataUpdated
data: {"timestamp":1737553240000,"source":"push"}

event: statusesUpdated
data: {"statuses":["incomplete","completed","in-progress"]}

event: gitAvailability
data: {"available":true}

event: fetchStatus
data: {"inProgress":false}

event: countdown
data: {"secondsUntilNextFetch":540}
```

### Event Types

**`connected`**
- Sent immediately on connection
- Confirms SSE connection established

**`heartbeat`**
- Sent every 30 seconds
- Keeps connection alive

**`dataUpdated`**
- Sent when data changes (item created, updated, etc.)
- Clients should refresh their data
- `source`: `"push"` (after commit/push) or `"fetch"` (after fetch from remote)

**`statusesUpdated`**
- Sent when `statuses.json` changes
- Clients should refresh status dropdowns

**`gitAvailability`**
- Sent when git remote becomes available/unavailable
- `available`: boolean

**`fetchStatus`**
- Sent when fetch operation starts/completes
- `inProgress`: boolean

**`countdown`**
- Sent every second during countdown to next fetch
- `secondsUntilNextFetch`: number

### JavaScript Example

```javascript
const eventSource = new EventSource('http://localhost:62781/api/events');

eventSource.addEventListener('connected', (e) => {
  console.log('Connected to Sparkle');
});

eventSource.addEventListener('dataUpdated', (e) => {
  const data = JSON.parse(e.data);
  console.log('Data updated from:', data.source);
  // Refresh your UI here
  loadItems();
});

eventSource.addEventListener('gitAvailability', (e) => {
  const data = JSON.parse(e.data);
  console.log('Git available:', data.available);
  updateGitIndicator(data.available);
});

eventSource.onerror = (e) => {
  console.error('SSE error, connection lost');
  // Attempt reconnect
};
```

---

## Error Handling

### HTTP Status Codes

- `200 OK` - Successful request
- `400 Bad Request` - Invalid request body or parameters
- `404 Not Found` - Endpoint or resource not found
- `500 Internal Server Error` - Server error (check daemon logs)

### Error Response Format

```json
{
  "error": "Error message here"
}
```

### Example Error Handling

```javascript
async function callApi(endpoint, body) {
  const response = await fetch(`http://localhost:${port}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    throw new Error(result.error || 'Unknown error');
  }

  return result;
}

try {
  await callApi('/api/createItem', {
    tagline: 'Fix bug',
    status: 'invalid-status' // This will fail
  });
} catch (error) {
  console.error('API error:', error.message);
  // Output: "API error: Invalid status"
}
```

---

## Complete Example: Todo List Application

Here's a complete example of using the HTTP API to build a simple todo list:

```javascript
import { readFileSync } from 'fs';

// Get port
const port = readFileSync('.sparkle-worktree/sparkle-data/last_port.data', 'utf8').trim();
const baseUrl = `http://localhost:${port}`;

// Helper function
async function apiCall(endpoint, body = null) {
  const options = {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {}
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const result = await response.json();

  if (!response.ok || result.error) {
    throw new Error(result.error || 'Unknown error');
  }

  return result;
}

// Create tasks
const task1 = await apiCall('/api/createItem', {
  tagline: 'Write project proposal',
  status: 'incomplete'
});

const task2 = await apiCall('/api/createItem', {
  tagline: 'Get approval from manager',
  status: 'incomplete'
});

const task3 = await apiCall('/api/createItem', {
  tagline: 'Start implementation',
  status: 'incomplete'
});

// Set up dependencies
await apiCall('/api/addDependency', {
  itemNeeding: task2.itemId,
  itemNeeded: task1.itemId  // Approval depends on proposal
});

await apiCall('/api/addDependency', {
  itemNeeding: task3.itemId,
  itemNeeded: task2.itemId  // Implementation depends on approval
});

// Check what's ready to work on
const items = await apiCall('/api/allItems');
console.log('All tasks:');
items.forEach(item => {
  console.log(`  ${item.itemId}: ${item.tagline} (${item.status})`);
});

// Complete first task
await apiCall('/api/updateStatus', {
  itemId: task1.itemId,
  status: 'completed',
  text: 'Proposal written and reviewed'
});

// Subscribe to real-time updates
const eventSource = new EventSource(`${baseUrl}/api/events`);
eventSource.addEventListener('dataUpdated', (e) => {
  console.log('Data changed, refreshing...');
  // Reload items here
});
```

---

## Testing and Development

### Integration Testing

If you're developing Sparkle or contributing changes, integration tests validate the API functionality.

**Running tests:**
```bash
npm run test:integration
```

**Critical workflow:**
1. Make code changes
2. Commit: `git commit -am "description"`
3. Release: `npm run release`
4. Test: `npm run test:integration`

Tests install from the tarball, so uncommitted changes won't be tested.

### Debugging API Issues

Use the query script to test API endpoints against a test instance:

```bash
# Test createItem endpoint
node bin/query-test-daemon.js \
  .integration_testing/test-name/clone1 \
  /api/createItem \
  '{"tagline": "Test item", "status": "incomplete"}'

# Test getItemDetails endpoint
node bin/query-test-daemon.js \
  .integration_testing/test-name/clone1 \
  /api/getItemDetails \
  '{"itemId": "12345678"}'
```

The script:
- Starts a daemon in test mode
- Calls the API endpoint
- Returns JSON response
- Cleans up properly

### HTTP Logging in Test Mode

When running in test mode (`--test-mode` flag), the daemon sends logs to a centralized log server:

```javascript
// Daemon automatically initializes HTTP logger
initHttpLogger(logPort, processToken);

// All logs go to both console and HTTP server
httpLog('info', 'Daemon starting', { port: 12345 });
```

Test logs are collected in `.integration_testing/integration-tests.log` for debugging.

For complete testing documentation, see [Sparkle-in-Sparkle Guide](sparkle-in-sparkle.md).

---

## Next Steps

- **Installation:** See [Getting Started Guide](getting_started.md)
- **Web UI:** See [Web UI Usage Guide](web_ui_guide.md)
- **Architecture:** See [Git Architecture Manual](git_architecture.md)
- **Testing:** See [Sparkle-in-Sparkle Guide](sparkle-in-sparkle.md)

---

**Copyright 2025 Limitless Knowledge Association**
Licensed under MIT License
