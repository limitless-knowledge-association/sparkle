# Sparkle Web UI Usage Guide

Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.

This guide explains how to use the Sparkle web interface to manage items, track dependencies, and collaborate with your team.

## Table of Contents

- [Overview](#overview)
- [User Operations Page](#user-operations-page)
- [Working with Items](#working-with-items)
- [Managing Dependencies](#managing-dependencies)
- [Tree View](#tree-view)
- [Inspector View](#inspector-view)
- [Status Bar and Real-Time Updates](#status-bar-and-real-time-updates)
- [Common Workflows](#common-workflows)
- [Tips and Best Practices](#tips-and-best-practices)

---

## Overview

Sparkle provides three main web pages:

1. **User Operations** (`list_view.html`) - Main list view for creating and managing items
2. **Tree View** (`tree_view.html`) - Visual dependency tree showing relationships
3. **Inspector** (`inspector.html`) - Deep dive into a single item and its dependencies

All pages update in real-time when changes occur, so multiple team members can work simultaneously.

---

## User Operations Page

This is your main workspace for managing items. Access it by running:

```bash
npx sparkle browser
```

### Status Bar

Located at the top of every page, the status bar shows:

- **Connection Status**:
  - Green dot = Connected to Sparkle daemon
  - Yellow dot = Disconnected or reconnecting

- **Current Branch**: The Git branch storing Sparkle data (e.g., `sparkle-data`)

- **Sparkle Version**: The version number (e.g., `1.0.78`)

- **Git Status**:
  - "Available" (green) = Can sync with remote repository
  - "Offline" (yellow) = No network connection (working locally only)

- **Last Update**: Timestamp of the most recent change

- **Next Update**: Countdown to next automatic sync (e.g., "Next update in 8 minutes")

- **Navigation**: Link to switch between List View and Tree View

### Quick Actions

Three buttons at the top:

#### Create Item

**Purpose:** Create a new item (task, bug, feature, etc.)

**Steps:**
1. Click **"Create Item"** button
2. A modal opens with three fields:
   - **Tagline** (required): Short description (e.g., "Fix login bug" or "Implement user dashboard")
   - **Initial Status** (optional): Select from dropdown (default: "incomplete")
   - **Initial Entry** (optional): Add notes or context
3. Click **"Create"**
4. Item appears in the list immediately

**Tips:**
- Keep taglines short but descriptive
- Use initial entry for detailed requirements or context
- Status defaults to "incomplete" for new items

---

#### Fetch Updates

**Purpose:** Manually sync with the remote repository

**What it does:**
- Fetches changes from teammates
- Merges remote updates into your view
- Updates the "Last Update" timestamp

**When to use:**
- You want to see teammates' changes immediately
- You're waiting for someone else to complete a dependency
- Automatic sync countdown is too slow for your needs

**Note:** All your local changes are automatically pushed immediately, so this button only fetches incoming changes.

---

#### Manage Statuses

**Purpose:** Configure custom status values for your workflow

**Built-in statuses** (cannot be changed):
- `incomplete` - Item not yet finished
- `completed` - Item is done

**Custom statuses** (you define):
- Common examples: `in-progress`, `blocked`, `on-hold`, `review`, `testing`
- Enter one status per line in the textarea
- Click **"Save"** to apply

**Effect:**
- Custom statuses appear in the status dropdown for all items
- All team members see the same status options
- Helps standardize workflow across the team

---

### Items Section

#### Search and Filter

**Filter Text Box:**
- **Search by tagline**: Type any text to match item descriptions
- **Search by item ID**: Type an 8-digit number (e.g., `12345678`)
- Case-insensitive
- Updates results instantly as you type

**Show Pending Only Checkbox:**
- When checked: Shows only items that are:
  1. NOT completed, AND
  2. Have all dependencies met (ready to work on)
- This is your "what can I do next?" view
- Unchecked: Shows all items

**Visibility Filter:**
- Controls display of ignored items
- **Not ignored (default)**: Hides ignored items from the list
- **All items**: Shows everything including ignored items
- **Ignored only**: Shows only ignored items
- Useful for finding items you've previously hidden

**Monitor Status Filter:**
- Filter items by whether you're monitoring them
- **All items**: Shows everything regardless of monitor status
- **Monitored only**: Shows only items you're watching
- **Not monitored only**: Shows items you're not watching

**Taken By Filter:**
- Filter items by who has taken responsibility
- **All items (default)**: Shows everything regardless of taken status
- **Taken by anyone**: Shows only items someone has taken
- **Not taken**: Shows only items no one has taken
- **Taken by [Name]**: Shows only items taken by a specific person
- Dropdown dynamically updates with names of people who have taken items

---

#### Items Table

The table displays all items with these columns:

| Column | Description |
|--------|-------------|
| **Pending** | Shows "Pending" if item is ready to work on (all dependencies met) |
| **Created** | Date and time the item was created |
| **Status** | Color-coded badge (green=completed, blue=pending, yellow=other) |
| **Taken By** | Shows who has taken responsibility for the item (e.g., "👤 Alice") |
| **Tagline** | Item description/title |

**Click any row** to open the Item Editor modal for that item.

**Empty states:**
- "No items found" - No items exist yet
- "No pending items found" - No items are ready to work on
- "No items match the filter" - Search returned no results
- "Loading..." - Fetching data from server

---

## Working with Items

### Item Editor Modal

Opens when you click an item in the list. Shows complete details and allows editing.

#### Item Information

**Item ID** (read-only)
- Unique 8-digit identifier
- Use this to reference items in discussions

**Tagline** (editable)
- Click in the text field to edit
- "OK" button appears when you change it
- Click "OK" to save
- Success message confirms the update

**Status** (dropdown)
- Select from available statuses
- Changes are saved immediately
- Cannot mark as "completed" if dependencies are incomplete

**Created** (read-only)
- Timestamp showing when the item was created

**Creator** (read-only)
- Name and email of the person who created it
- From their git user configuration

---

#### Action Buttons

**Needs**
- Opens modal to select what items THIS item depends on
- Example: If you're working on "Deploy app", it might depend on "Run tests"
- See [Managing Dependencies](#managing-dependencies) section below

**Supports**
- Opens modal to select what items depend on THIS item (the inverse)
- Example: If "Run tests" provides to "Deploy app", then deployment needs tests
- Useful when setting up relationships from the provider side

**Open in Inspector**
- Opens a new window showing the full dependency graph around this item
- Shows all dependencies AND all items that depend on this one
- See [Inspector View](#inspector-view) section below

**Ignore / Un-ignore**
- Hides item from default list views (click "Ignore") or shows it again (click "Un-ignore")
- Ignored items are still in the system and show in audit trails
- Monitored+ignored items still appear in the monitor view
- Useful for "parking" items you don't want to see but might need later
- Button appearance changes when item is ignored (shows "Un-ignore" button)

**Take Responsibility / Surrender**
- **Take Responsibility** - Claim ownership of an item to show you're working on it
- **Surrender** - Release ownership when you're no longer working on it
- Only one person can take an item at a time (exclusive ownership)
- Button shows different states:
  - Gray button: "👤 Take Responsibility" (no one has it)
  - Blue button: "✓ Taken by You - Click to Surrender" (you have it)
  - Yellow button: "👤 Taken by [Name] - Click to Take" (someone else has it)
- Taking is voluntary - you cannot assign items to others
- When you take an item someone else has, you automatically become the new owner
- Shows in the "Taken By" column in the list view
- Use the "Taken By" filter to find your items or see what others are working on

---

#### Adding Entries

Entries are notes, updates, or comments about an item.

**How to add:**
1. Type in the **"Enter your note or update..."** text area
2. Click **"Add Entry"** button (enabled when you type something)
3. Entry is saved and appears in the "Previous Entries" section below

**Common uses:**
- Document decisions ("Decided to use JWT for auth")
- Track progress ("Completed API integration, starting UI work")
- Note blockers ("Waiting for design review")
- Link resources ("See: https://example.com/spec")

**Entry history:**
- All entries are shown in reverse chronological order (newest first)
- Each shows: Author name, timestamp, and the entry text
- Entries are immutable (cannot be edited or deleted)

---

#### Audit Trail

Click **"View Audit Trail"** button to see complete history:

**What's included:**
- Item creation
- Tagline changes
- Status changes
- Entries added
- Dependencies added/removed
- Monitors added/removed
- Items ignored/un-ignored
- Responsibility taken/surrendered

**Each event shows:**
- What changed
- Who made the change
- When it happened

**Use cases:**
- Understand how an item evolved
- Track who did what
- Debug unexpected status changes
- Review decision history

---

## Managing Dependencies

Dependencies define the order in which work must be completed. If item A depends on item B, then B must be completed before A can be marked complete.

### Opening Dependency Manager

From the Item Editor, click either:
- **"Needs"** - Set what THIS item depends on
- **"Supports"** - Set what items depend on THIS item

### Dependency Manager Modal

#### Search Box

- Filter items by tagline or item ID
- Narrows both "Currently Selected" and "Available Items" sections
- Real-time filtering as you type

#### Currently Selected

Shows items already set as dependencies/dependents:
- Checkbox (checked) next to each item
- Tagline and item ID
- Click checkbox or item row to deselect

#### Available Items

Shows candidate items that can be added:
- Checkbox (unchecked) next to each item
- Tagline and item ID
- Click checkbox or item row to select

**Important:** Items that would create a circular dependency are automatically excluded and won't appear in the list.

---

### Saving Changes

1. Select/deselect items as needed
2. Click **"Save Changes"** button
3. Modal closes and dependencies are updated
4. Item Editor refreshes to show new relationships

**Cancel** button discards all changes.

---

### Understanding Dependencies

**Example dependency chain:**
```
Project Launch
├── Backend Complete
│   ├── Database Schema
│   └── API Implementation
└── Frontend Complete
    ├── UI Components
    └── API Integration
        └── API Implementation (shared)
```

In this structure:
- "Project Launch" depends on "Backend Complete" and "Frontend Complete"
- "Backend Complete" depends on "Database Schema" and "API Implementation"
- "API Integration" depends on "API Implementation" (shared dependency)

**Completion order:**
1. Complete "Database Schema" and "API Implementation" (no dependencies)
2. Complete "Backend Complete" (its dependencies are met)
3. Complete "UI Components" and "API Integration" (dependencies met)
4. Complete "Frontend Complete" (its dependencies are met)
5. Complete "Project Launch" (all dependencies met)

---

### Status Propagation

**Rule:** A completed item with incomplete dependencies automatically becomes incomplete.

**Example:**
1. Item A is marked "completed"
2. You add a dependency: A depends on B
3. B is still "incomplete"
4. Result: A is automatically marked "incomplete" (cannot be complete if dependencies aren't met)

This ensures the dependency graph stays consistent.

---

## Tree View

Visual representation of the entire dependency graph.

### Accessing Tree View

Click **"Tree View →"** link in the status bar, or navigate to `tree_view.html`.

### Tree Structure

Items are displayed in a hierarchical tree:

```
[+] needs 12345678 - Deploy to production (incomplete)
[-] needs 23456789 - Run tests (incomplete)
    [+] needs 34567890 - Fix failing tests (incomplete)
    [] 45678901 - Write new test cases (completed)
```

**Symbols:**
- `[+]` - Collapsed node (has hidden children)
- `[-]` - Expanded node (children visible)
- `[]` - Leaf node (no children)

**Relationship labels:**
- `needs` - This item depends on the item shown
- `provides to` - This item is needed by the item shown

---

### Tree Navigation

**Expand/Collapse:**
- Click `[+]` to expand and show dependencies
- Click `[-]` to collapse and hide dependencies
- `[]` cannot be expanded (no children)

**View Item Details:**
- Click on any item ID or tagline
- Opens the Item Editor modal
- Make changes without leaving tree view

**Return to List View:**
- Click **"← List View"** link in the status bar

---

### Using Tree View

**Best for:**
- Understanding project structure
- Visualizing how items relate to each other
- Planning work order
- Identifying bottlenecks (items many things depend on)
- Finding root items (top-level goals)

**Tips:**
- Start with root items (things with no providers)
- Expand to see what needs to be done first
- Look for completed items (green badges)
- Identify pending items (ready to work on)

---

## Inspector View

Deep-dive view showing all relationships for a single item.

### Opening Inspector

From Item Editor, click **"Open in Inspector"** button, or navigate to:
```
inspector.html?itemId=12345678
```

### Anchor Item Section

The top shows the item being inspected:
- Highlighted in blue gradient background
- ★ Star icon before the item ID
- Shows: Item ID, tagline, status, and creation date

---

### Dependency Graph

The inspector shows a complete graph:

**Legend:**
- Blue square = Anchor item (the one you're inspecting)
- Red square = Dependencies (items the anchor depends on)
- Green square = Providers (items that depend on the anchor)

**Graph structure:**
```
Items ABOVE anchor = Things this item needs
       ↓
  [ Anchor Item ]
       ↓
Items BELOW anchor = Things that need this item
```

**All branches expanded by default** - You see the full relationship tree immediately.

---

### Navigation

**Open in Editor:**
- Opens the anchor item in Item Editor modal
- Allows quick editing without leaving the page

**Back to Home:**
- Returns to the main User Operations page

**Click any item in the tree:**
- Opens that item's details in the Item Editor modal
- Navigate between related items easily

---

### Use Cases

**When to use Inspector:**
- Understanding complex dependencies
- Tracing why an item is blocked
- Seeing the full impact of completing an item
- Planning which dependencies to tackle first
- Debugging circular dependency issues (shouldn't happen, but helpful if they do)

---

## Status Bar and Real-Time Updates

### Connection Status

**Connected (Green dot):**
- Daemon is running and responding
- All features work normally
- Changes sync automatically

**Disconnected (Yellow dot):**
- Lost connection to daemon
- Attempting to reconnect automatically
- Shows reconnection attempt count

**Reconnection Process:**
- Tries up to 10 times with exponential backoff
- Starts with 1 second delay, increases to 10 seconds
- After 10 attempts: Shows "Unable to reconnect" message

**Recovery:**
- If reconnection fails, restart the daemon: `npx sparkle-halt` then `npx sparkle browser`
- Page will automatically reconnect when daemon is available

---

### Server-Sent Events (SSE)

Sparkle uses SSE to push real-time updates to all connected browsers.

**Events:**
- **Data Updated** - Item changes, reload list/tree
- **Statuses Updated** - Custom statuses changed, reload dropdown
- **Git Availability** - Network status changed
- **Fetch Status** - Sync operation started/completed
- **Heartbeat** - Connection alive check

**Effect:**
- Changes in one browser tab appear in all other tabs
- Multiple team members see updates immediately
- No manual refresh needed

---

### Git Status Indicator

**"Available" (green):**
- Connected to remote repository
- Changes are syncing to team
- Fetch/push operations work

**"Offline" (yellow):**
- No network or remote not accessible
- Changes saved locally only
- Will sync when connection restored

**Normal offline operation:**
- You can keep working
- Changes commit to local git
- Auto-syncs when network returns

---

## Common Workflows

### Creating and Completing a Simple Task

1. Click **"Create Item"**
2. Enter tagline: "Fix navigation menu bug"
3. Click **"Create"**
4. Item appears in list with status "incomplete"
5. Click the item to open editor
6. Add entry: "Reproduced on staging, caused by CSS conflict"
7. Change status to "in-progress"
8. (Work on the task...)
9. Add entry: "Fixed in commit abc123"
10. Change status to "completed"
11. Done! Item shows as completed in list

---

### Planning a Feature with Dependencies

**Goal:** Implement user authentication

**Steps:**

1. **Create the main feature item:**
   - Tagline: "User authentication feature"
   - Status: "incomplete"

2. **Create sub-tasks:**
   - "Design auth database schema"
   - "Implement backend API"
   - "Create login UI"
   - "Write integration tests"

3. **Set up dependencies:**
   - Open "User authentication feature" → Needs
   - Select: "Implement backend API", "Create login UI", "Write integration tests"
   - Save

   - Open "Implement backend API" → Needs
   - Select: "Design auth database schema"
   - Save

   - Open "Create login UI" → Needs
   - Select: "Implement backend API"
   - Save

   - Open "Write integration tests" → Needs
   - Select: "Implement backend API", "Create login UI"
   - Save

4. **View in Tree View:**
   ```
   User authentication feature
   ├── Implement backend API
   │   └── Design auth database schema
   ├── Create login UI
   │   └── Implement backend API
   └── Write integration tests
       ├── Implement backend API
       └── Create login UI
   ```

5. **Start work:**
   - Check "Show pending only"
   - See "Design auth database schema" (ready to work on)
   - Complete it
   - Next pending item: "Implement backend API"
   - Continue in order

---

### Tracking a Bug with Entries

1. Create item: "Users logged out randomly"
2. Add entry: "Reported by customer, happens after 5 minutes"
3. Add entry: "Reproduced on staging environment"
4. Change status: "in-progress"
5. Add entry: "Found issue: session timeout set to 5 min instead of 30"
6. Add entry: "Updated config/session.js, timeout now 30 minutes"
7. Add entry: "Deployed to staging, tested for 1 hour - no logout"
8. Change status: "completed"
9. **Result:** Complete history of investigation and fix preserved

---

### Finding What to Work On Next

**Option 1: Pending filter**
1. Go to User Operations page
2. Check **"Show pending only"**
3. See list of items ready to work on
4. Pick one and start

**Option 2: Tree view**
1. Go to Tree View
2. Find your project/feature
3. Expand to see dependencies
4. Look for incomplete leaf nodes (no dependencies)
5. Work on those first

**Option 3: Search**
1. Type your name in search box (if taglines include assignees)
2. Or search for specific feature/area
3. Filter results with "Show pending only"
4. Work through the list

**Option 4: Taken By filter (see your work)**
1. Go to User Operations page
2. Open **"Taken By"** dropdown
3. Select **"Taken by [Your Name]"**
4. See all items you've taken responsibility for
5. Continue working on them or surrender items you're done with

---

### Taking Ownership of Work

**Claiming an item:**
1. Find an item to work on (using pending filter, search, etc.)
2. Open the item in the editor
3. Click **"Take Responsibility"** button (gray, shows 👤 icon)
4. Button changes to blue: "✓ Taken by You"
5. Item now shows your name in the "Taken By" column
6. Others can see you're working on it

**Finishing your work:**
1. Complete the item (add entries, update status)
2. When done, click **"Surrender"** button (blue)
3. Button returns to gray "Take Responsibility"
4. Item is now available for others to take
5. Or you can take a different item

**Taking from someone else:**
- If you see a yellow button: "👤 Taken by [Name]"
- You can click it to take the item from them
- They lose ownership automatically (no notification)
- Use this when taking over work or coordinating with team

**Typical workflow:**
1. Morning: Filter by "Not taken" + "Pending"
2. Take 2-3 items you'll work on today
3. Throughout day: Add entries, update status
4. Evening: Surrender completed items or items you can't finish
5. Repeat next day

---

## Tips and Best Practices

### Writing Good Taglines

**Do:**
- "Fix login redirect loop on logout"
- "Implement pagination for user list API"
- "Update deployment docs for Docker"

**Don't:**
- "Fix bug" (too vague)
- "TODO" (not descriptive)
- "asdf testing 123" (not meaningful)

**Tips:**
- Include action verb (Fix, Implement, Update, Design)
- Be specific enough to search later
- Keep under 60-80 characters
- Don't duplicate info that goes in entries

---

### Using Entries Effectively

**Good entry examples:**
```
"Decided to use JWT tokens instead of sessions for scalability"

"Waiting on API spec from backend team before implementing"

"Found helpful resource: https://example.com/authentication-best-practices"

"Completed backend work, starting UI components tomorrow"

"Discovered edge case: what if user email changes? Needs discussion."
```

**Tips:**
- Document decisions and reasoning
- Note blockers or dependencies
- Link to relevant resources
- Track progress milestones
- Ask questions for team to see

---

### Dependency Best Practices

1. **Keep it simple:** Don't create dependencies for every tiny relationship
2. **Be realistic:** Only add dependencies that truly block progress
3. **Use Tree View:** Visualize before adding complex dependencies
4. **Avoid cycles:** Sparkle prevents them, but plan to avoid trying
5. **Update as you go:** Remove dependencies that turn out to be unnecessary

---

### Status Workflow

**Recommended status flow:**
```
incomplete → in-progress → completed
```

**With additional statuses:**
```
incomplete → in-progress → review → completed
                  ↓
               blocked → in-progress (when unblocked)
```

**Tips:**
- Don't create too many statuses (overwhelming)
- 4-6 statuses are usually enough
- Make status names obvious (avoid jargon)
- Document status meanings for your team

---

### Collaboration Tips

1. **Add entries frequently:** Keep team informed of progress
2. **Use "Fetch Now" before standup:** See latest team updates
3. **Check Tree View together:** Shared understanding of structure
4. **Reference item IDs in chat:** Easy to find items later
5. **Update status regularly:** Helps team see what's active
6. **Use Inspector for handoffs:** Show full context when transferring work
7. **Take items you're working on:** Makes it clear who's doing what
8. **Surrender when blocked:** Free up items for others to take
9. **Use "Taken By" filter:** Quick standup view of who's working on what
10. **Coordinate before taking from others:** Talk to them first if possible

---

### Performance Tips

1. **Filter when list is large:** Use search or "pending only" to reduce clutter
2. **Close unused modals:** Click outside or "Cancel" button
3. **Use Tree View for big picture:** Better than scrolling long lists
4. **Restart daemon occasionally:** If it feels slow after days of use
5. **Keep taglines concise:** Faster to scan and search

---

## Troubleshooting

### Item won't mark as completed

**Cause:** Has incomplete dependencies

**Solution:**
1. Open the item in editor
2. Click "Open in Inspector"
3. Look at dependencies (red squares)
4. Complete those first
5. Then mark this item complete

---

### Can't find an item

**Solutions:**
- Search by item ID (8-digit number)
- Search by keyword in tagline
- Uncheck "Show pending only"
- Click "Fetch Updates" (might be from teammate)

---

### Changes not appearing in other tabs

**Solutions:**
- Check connection status (should be green)
- Click "Fetch Updates" manually
- Refresh browser page (Ctrl+R or Cmd+R)
- Check if daemon is running: `npx sparkle browser`

---

### Dependency modal shows "no available items"

**Causes:**
- All items would create a cycle
- Or no other items exist yet

**Solutions:**
- Create more items first
- Check Tree View to understand current structure
- May need to restructure dependencies

---

### Tree View is empty

**Causes:**
- No items created yet
- Or all items are independent (no dependencies)

**Solutions:**
- Create some items first
- Add dependencies between items
- Check User Operations page to confirm items exist

---

## Keyboard Shortcuts

**General:**
- `Escape` - Close any modal
- `Ctrl/Cmd + Click` - Open inspector in new tab (on item)

**Modal forms:**
- `Enter` - Submit form (when in text field)
- `Tab` - Move between fields
- `Escape` - Cancel and close

**Tips:**
- Most actions require clicking buttons (no extensive keyboard nav)
- Focus on mouse/trackpad for best experience
- Use browser back/forward for page navigation

---

## Next Steps

- **Developer integration:** See [Developer API Manual](developer_api.md) to integrate Sparkle into your code
- **Understand Git:** See [Git Architecture Manual](git_architecture.md) to learn how data is stored
- **Installation help:** See [Getting Started Guide](getting_started.md) for setup and configuration

---

**Copyright 2025 Limitless Knowledge Association**
Licensed under MIT License
