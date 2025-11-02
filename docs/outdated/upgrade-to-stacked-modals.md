# Upgrade to Stacked Modals

## End Goal

Create a stacked modal system that allows multiple modals to be open simultaneously with proper z-ordering and interaction management.

### Target Behavior

1. **Multiple Modal Instances**: Users can open multiple item editors, dependency managers, etc. at the same time
2. **Z-Order Stacking**: Modals stack on top of each other with proper layering (later modals appear on top)
3. **Overlay Management**: Only the topmost modal shows its backdrop overlay
4. **Click Outside Behavior**: Clicking outside the topmost modal triggers a beep sound but takes no other action
5. **ESC Key Handling**: ESC key only affects the topmost modal (closes it or cancels unsaved changes)
6. **No Depth Limit**: System supports unlimited modal depth (memory permitting)
7. **Visual Clarity**: Lower modals remain visible beneath the top modal (no dimming or visual distinction)
8. **Proper Cleanup**: When closing a modal, return to the modal underneath it

### Example User Flow

```
User opens Item A → Item Editor(A)
  ↓
Clicks "Needs" → Dependency Manager(A) [stacked on top of Item Editor(A)]
  ↓
Clicks "Create Item" → Item Creator [stacked on top of Dependency Manager(A)]
  ↓
Creates Item B → Item Creator closes
  ↓
System links Item B → Item Editor(B) opens [stacked on top of Dependency Manager(A)]
  ↓
User closes Item Editor(B) → Returns to Dependency Manager(A)
  ↓
User closes Dependency Manager(A) → Returns to Item Editor(A)
```

### Technical Requirements

- **Instance-based State**: Each modal instance maintains its own state (no shared module-level variables)
- **Unique DOM IDs**: Each modal instance has unique DOM element IDs to prevent conflicts
- **Event Isolation**: Event handlers are scoped to specific modal instances
- **Memory Management**: Proper cleanup when modals are closed (no memory leaks)
- **SSE Subscriptions**: Each modal can subscribe to server-sent events independently
- **Global Modal Stack**: Central manager tracks all open modals and their z-order

---

## Implementation Plan

### Stage 1: Refactor to Class-Based Architecture

**Goal**: Convert all modals from module-level variables to class-based instances while maintaining current behavior (one modal at a time).

#### Phase 1A: Item Creator Modal (Simplest)

**File**: `item-creator.js` (316 lines)

**Current Issues**:
- Module-level variable: `onCreateCallback`
- Hardcoded DOM ID: `itemCreatorModal`
- Global window functions: `closeItemCreator`

**Changes**:
1. Create `ItemCreatorModal` class
2. Move `onCreateCallback` to instance property
3. Convert `openItemCreator(onCreate)` to factory function that instantiates class
4. Convert `closeItemCreator()` to instance method `close()`
5. Add `destroy()` method for cleanup
6. Keep hardcoded ID (for now, Stage 2 will make unique)

**Pattern**:
```javascript
export class ItemCreatorModal {
  constructor(onCreate) {
    this.id = 'itemCreatorModal';
    this.onCreateCallback = onCreate;
    this.element = null;
    this.createDOM();
    this.setupEventHandlers();
  }

  createDOM() { /* inject HTML */ }
  setupEventHandlers() { /* bind events */ }
  show() { /* add 'show' class */ }
  close() { /* remove modal, cleanup */ }
  destroy() { /* remove DOM, event listeners */ }
}

export function openItemCreator(onCreate) {
  const instance = new ItemCreatorModal(onCreate);
  instance.show();
  return instance;
}
```

#### Phase 1B: Dependency Manager Modal (Moderate Complexity)

**File**: `dependency-manager.js` (765 lines)

**Current Issues**:
- 8 module-level variables:
  - `currentItemId`
  - `dependencyMode`
  - `dependencyData`
  - `onSaveCallback`
  - `originalCheckboxStates`
  - `escapeKeyHandler`
  - `unsubscribeDataUpdate`
  - `waitingForItemId`
- Hardcoded DOM ID: `dependencyManagerModal`
- 5 global window functions
- SSE subscription for `aggregatesUpdated` event

**Changes**:
1. Create `DependencyManagerModal` class
2. Move all 8 module variables to instance properties
3. Convert all window functions to instance methods
4. Store SSE unsubscribe function, call in `destroy()`
5. Scope all event handlers to instance
6. Keep hardcoded ID (Stage 2 will make unique)

#### Phase 1C: Item Editor Modal (Most Complex)

**File**: `item-editor.js` (1374 lines, ~900 lines logic + ~500 lines CSS)

**Current Issues**:
- 6 module-level variables:
  - `currentItemId`
  - `statusUpdateCallbacks`
  - `originalTagline`
  - `serverTagline`
  - `unsubscribeAggregateUpdate`
  - `escapeKeyHandler`
- Hardcoded DOM ID: `itemEditorModal`
- 16 global window functions (all `itemEditor*` functions)
- 45+ DOM queries using `document.getElementById()`
- SSE subscription for `aggregatesUpdated` event

**Changes**:
1. Create `ItemEditorModal` class
2. Move all 6 module variables to instance properties
3. Convert all 16 window functions to instance methods
4. Replace all `document.getElementById()` with scoped queries
5. Store SSE unsubscribe function, call in `destroy()`
6. Keep hardcoded ID (Stage 2 will make unique)

#### Stage 1 Success Criteria

✅ All three modal files converted to classes
✅ Current behavior preserved (only one modal instance at a time)
✅ No changes needed to calling code (list_view.html, inspector.html, etc.)
✅ All modal functionality works exactly as before
✅ Clean garbage collection when modals close
✅ No memory leaks (event listeners properly removed)
✅ No console errors

**Testing after Stage 1**:
- Open and close each modal type multiple times
- Test all buttons and functionality within each modal
- Verify ESC key behavior
- Verify overlay click behavior
- Check browser DevTools for memory leaks

---

### Stage 2: Enable Modal Stacking

**Goal**: Allow multiple instances of modals to exist simultaneously with proper z-ordering.

#### Phase 2A: Create Modal Stack Manager

**New File**: `modal-stack.js`

**Components**:

1. **ModalStack class**:
   - Maintains array of modal instances (bottom to top)
   - Assigns z-index based on stack position (base 10000, increment by 2)
   - Routes ESC key to topmost modal
   - Manages overlay visibility (only top modal shows overlay)
   - Implements beep sound for clicking outside modals
   - No depth limit

2. **StackableModal base class**:
   - Provides common interface for all modal types
   - Handles z-index assignment
   - Handles overlay show/hide
   - Provides `destroy()` and `close()` methods
   - Manages event unsubscribe functions

**Key Features**:
```javascript
class ModalStack {
  constructor() {
    this.stack = [];
    this.baseZIndex = 10000;
  }

  push(modalInstance) {
    const zIndex = this.baseZIndex + this.stack.length * 2;
    modalInstance.setZIndex(zIndex);
    this.stack.push(modalInstance);
    this.updateOverlays(); // Only top shows overlay
  }

  pop() {
    const modal = this.stack.pop();
    modal?.destroy();
    this.updateOverlays();
  }

  getTop() {
    return this.stack[this.stack.length - 1];
  }

  beep() {
    // Play beep sound using Web Audio API
  }
}
```

#### Phase 2B: Add Unique DOM IDs

**Changes to all three modal classes**:

1. Generate unique ID per instance:
   ```javascript
   constructor(...) {
     this.instanceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
     this.id = `itemEditorModal-${this.instanceId}`;
   }
   ```

2. Update HTML templates to use unique IDs:
   ```javascript
   createDOM() {
     const html = `
       <div id="${this.id}" class="item-editor-modal">
         <div id="${this.id}-overlay" class="item-editor-overlay">
         <div id="${this.id}-header">
           <span id="${this.id}-itemId"></span>
         </div>
         <input id="${this.id}-tagline" />
       </div>
     `;
   }
   ```

3. Update all DOM queries to use scoped IDs:
   ```javascript
   // Old: document.getElementById('itemTaglineInput')
   // New: this.element.querySelector(`#${this.id}-tagline`)
   ```

#### Phase 2C: Integrate Modal Stack

**Changes to each modal class**:

1. Import `modalStack` singleton
2. Register with stack on creation:
   ```javascript
   show() {
     modalStack.push(this);
     this.element.classList.add('show');
   }
   ```

3. Unregister on close:
   ```javascript
   close() {
     modalStack.remove(this);
     this.destroy();
   }
   ```

4. Handle ESC key through stack manager (not directly)

#### Phase 2D: Update Overlay Behavior

**Changes**:
1. Create separate overlay element per modal (outside modal content)
2. Only topmost modal's overlay is visible (controlled by ModalStack)
3. Clicking overlay triggers `modalStack.beep()` instead of closing

#### Phase 2E: Update Modal Opening Logic

**Key Change**: Don't close existing modals when opening new ones

```javascript
// OLD (Stage 1): Closes any existing instance
export function openItemEditor(itemId) {
  if (currentInstance) currentInstance.close();
  const instance = new ItemEditorModal(itemId);
  instance.show();
  return instance;
}

// NEW (Stage 2): Stacks on top of existing
export function openItemEditor(itemId) {
  const instance = new ItemEditorModal(itemId);
  instance.show(); // Automatically added to stack
  return instance;
}
```

#### Stage 2 Success Criteria

✅ Multiple modals can be open simultaneously
✅ Proper z-ordering (later modals appear on top)
✅ Only topmost modal shows backdrop overlay
✅ Clicking outside topmost modal beeps (no close)
✅ ESC key only affects topmost modal
✅ Closing a modal returns to the modal underneath
✅ Example flow works: Item Editor → Dependency Manager → Item Creator → Item Editor (new item) → close → back to Dependency Manager
✅ No memory leaks even with deep stacks
✅ All existing functionality still works

**Testing after Stage 2**:
- Open multiple item editors for different items
- Test nested flow: Item A → Needs → Create Item → Item B → close chain
- Open 10+ modals and verify z-ordering
- Test ESC key behavior with multiple modals
- Test clicking outside behavior
- Verify no memory leaks with deep stacks
- Test all existing functionality still works

---

## File Structure After Completion

```
public/
├── modal-stack.js              [NEW] Modal stack manager and base class
├── item-editor.js              [MODIFIED] Class-based, stackable
├── dependency-manager.js       [MODIFIED] Class-based, stackable
├── item-creator.js             [MODIFIED] Class-based, stackable
├── audit-trail.js              [Unchanged] Opens in new window
├── list_view.html              [Unchanged] Imports same API
├── inspector.html              [Unchanged] Imports same API
├── monitor.html                [Unchanged] Imports same API
└── ...
```

## Estimated Lines of Code Changes

### Stage 1
- item-creator.js: ~50 lines modified
- dependency-manager.js: ~120 lines modified
- item-editor.js: ~200 lines modified
- **Total: ~370 lines**

### Stage 2
- modal-stack.js: ~250 lines new file
- item-creator.js: ~80 lines modified (unique IDs)
- dependency-manager.js: ~150 lines modified (unique IDs)
- item-editor.js: ~250 lines modified (unique IDs, scope queries)
- **Total: ~730 lines**

**Grand Total: ~1100 lines of changes**

---

## Testing Procedure

After each phase of development, follow this procedure to build and deploy for user testing:

### Build and Release Steps

1. **Add new files to git** (if any were created):
   ```bash
   git add <filename>
   ```
   - Only add files intended to be part of the product
   - Do NOT add logs, temporary files, etc.

2. **Stage all modified files**:
   ```bash
   git add -u
   ```
   - This ensures all already-known files in git are included

3. **Commit the changes**:
   ```bash
   git commit -m "Descriptive commit message"
   ```

4. **Build release package**:
   ```bash
   npm run release
   ```
   - This creates a new versioned .tgz file (e.g., `sparkle-1.0.246.tgz`)

5. **Copy to test environment**:
   ```bash
   cp sparkle-1.0.*.tgz ../test2_sparkle/
   ```

6. **Install in test environment**:
   ```bash
   cd ../test2_sparkle
   npm install sparkle-1.0.*.tgz
   ```

7. **Notify user to test**:
   - Inform user which features to test
   - Provide specific test scenarios
   - Wait for feedback before proceeding to next phase

### Testing Checklist for Stage 1

After each modal is refactored, test:

- [ ] Modal opens correctly
- [ ] Modal displays all expected content
- [ ] All buttons and controls work
- [ ] ESC key closes modal (or cancels if dirty)
- [ ] Clicking overlay closes modal
- [ ] Modal closes cleanly without errors
- [ ] Can open modal multiple times in succession
- [ ] No console errors
- [ ] No memory leaks (check DevTools Memory tab)

**Specific tests per modal type**:

**Item Creator**:
- [ ] Opens with empty tagline field
- [ ] Can type tagline
- [ ] Create button creates item
- [ ] Cancel button closes without creating
- [ ] Callback is invoked with new itemId

**Dependency Manager**:
- [ ] Opens for "Needs" mode
- [ ] Opens for "Supports" mode
- [ ] Shows current dependencies
- [ ] Shows available candidates
- [ ] Can check/uncheck items
- [ ] Search box filters items
- [ ] Save Changes updates dependencies
- [ ] Create Item opens item creator
- [ ] ESC key handles dirty state correctly

**Item Editor**:
- [ ] Opens with correct item details
- [ ] Can edit tagline
- [ ] Can change status
- [ ] Can toggle monitoring
- [ ] Can toggle ignore
- [ ] Can toggle taken
- [ ] Can add entry
- [ ] Needs button opens dependency manager
- [ ] Supports button opens dependency manager
- [ ] Audit Trail button works
- [ ] Inspector button works
- [ ] SSE updates refresh the view

### Testing Checklist for Stage 2

After enabling stacking, test:

- [ ] Can open multiple item editors simultaneously
- [ ] Each modal has correct content (no cross-contamination)
- [ ] Z-ordering is correct (latest on top)
- [ ] Only topmost modal shows backdrop overlay
- [ ] Clicking outside topmost modal beeps (no close)
- [ ] ESC key only affects topmost modal
- [ ] Closing a modal returns to modal underneath
- [ ] Can open deep stack (10+ modals) without issues
- [ ] Memory usage reasonable with deep stacks

**Complex workflow test**:
1. Open Item A editor
2. Click "Needs" → Dependency Manager for A opens
3. Click "Create Item" → Item Creator opens
4. Create Item B → Item Creator closes, Item B editor opens
5. Close Item B editor → Returns to Dependency Manager for A
6. Close Dependency Manager → Returns to Item A editor
7. Verify Item A editor has correct content
8. No console errors throughout

## Risk Mitigation

1. **Backup Files**: Create `.backup` copies before refactoring
2. **Incremental Testing**: Test after each modal is refactored
3. **Stage Gates**: User testing between Stage 1 and Stage 2
4. **Rollback Plan**: Keep backup files until both stages are validated
5. **Browser Compatibility**: Test in Chrome, Firefox, Safari
6. **Memory Testing**: Use DevTools to monitor for leaks

---

## Benefits of Staged Approach

**Stage 1 Benefits**:
- Cleaner code architecture (classes vs module variables)
- Better memory management (proper cleanup)
- Foundation for stacking without breaking anything
- Easy to review (maintains current behavior)

**Stage 2 Benefits**:
- Powerful user workflow (navigate between related items without losing context)
- No more "which item was I looking at?" confusion
- Natural workflow: A needs B, B needs C, etc. - keep all open
- Reduces cognitive load (don't need to remember item IDs)

---

## Timeline Estimate

- **Stage 1**: 2-4 hours of development + testing
- **User Testing**: 1-2 days of validation
- **Stage 2**: 3-5 hours of development + testing
- **User Testing**: 2-3 days of validation
- **Total**: ~1 week end-to-end

---

## Questions for User Before Proceeding

1. ✅ Overlay behavior: Only topmost modal shows backdrop
2. ✅ Click outside: Beep sound, no close
3. ✅ No depth limit on modal stack
4. ✅ No visual distinction for lower modals
5. ✅ Refactor all three modals at once in Stage 1
6. Ready to begin Stage 1?
