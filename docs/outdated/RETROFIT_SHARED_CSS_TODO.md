# Retrofit Shared CSS - TODO

This document tracks the work needed to retrofit all modals and views to use the shared CSS from `sparkle-base.css`.

## Status

- ✅ **sparkle-base.css** - Created comprehensive shared modal styles
- ✅ **item-editor-new.js** - Updated to use shared CSS classes (Stage 1, Phase 1C in progress)
- ⏳ **item-editor.js** - Will be replaced by item-editor-new.js after testing
- 🔲 **dependency-manager.js** - Needs retrofit
- 🔲 **item-creator.js** - Needs retrofit
- 🔲 **list_view.html** - Needs to ensure sparkle-base.css is loaded
- 🔲 **inspector.html** - Needs to ensure sparkle-base.css is loaded
- 🔲 **monitor.html** - Needs to ensure sparkle-base.css is loaded
- 🔲 **admin.html** - Needs to ensure sparkle-base.css is loaded

## Shared CSS Classes Reference

### Modal Container Classes
- `.sparkle-modal` - Base modal container
- `.sparkle-modal.show` - Visible modal state
- `.sparkle-modal-overlay` - Backdrop overlay
- `.sparkle-modal-content` - Modal content container
  - `.size-small` - 500px max width
  - `.size-medium` - 700px max width
  - `.size-large` - 900px max width
- `.sparkle-modal-header` - Modal header section
- `.sparkle-modal-close` - Close button (×)
- `.sparkle-modal-body` - Modal body section
- `.sparkle-modal-footer` - Modal footer section

### Detail Row Pattern (for item details)
- `.detail-row` - Container for label + value pair
- `.detail-label` - Left side label (140px fixed width)
- `.detail-value` - Right side value (flex: 1)

### List Pattern (for entries, dependencies)
- `.item-list` - Unstyled list container
- `.item-list-item` - Individual list item with border and hover effect

### Form Elements
- `.form-group` - Form field container
- `.input-group` - Input + button combination
- Standard input/select/textarea styles (already in base CSS)

### Buttons
- `.btn-primary` - Primary action button (blue)
- `.btn-secondary` - Secondary action button (gray)
- `.btn-success` - Success/positive button (green)
- `.btn-danger` - Danger/negative button (red)
- `.button-group` - Container for button groups with gap

### State Messages
- `.loading-state` - Loading message
- `.error-state` - Error message
- `.empty-state` - Empty state message
- `.message.success` - Success message box
- `.message.error` - Error message box
- `.message.warning` - Warning message box
- `.message.info` - Info message box

### Utility Classes
- `.section` - Section container with background and padding
- `.section-header` - Section heading
- `.text-center`, `.text-muted`, `.text-small`, `.text-mono`
- `.mt-sm`, `.mt-md`, `.mt-lg` - Margin top variants
- `.mb-sm`, `.mb-md`, `.mb-lg` - Margin bottom variants
- `.flex`, `.flex-col`, `.items-center`, `.justify-between`, `.justify-end`
- `.w-full`, `.h-full`

## Retrofit Procedure for Modals

For each modal file (item-creator.js, dependency-manager.js):

### 1. Update Modal Container
Replace custom modal classes with shared ones:
```javascript
// Before:
<div class="custom-modal">
  <div class="custom-overlay"></div>
  <div class="custom-content">
    <div class="custom-header">
      <h3>Title</h3>
      <button class="custom-close">&times;</button>
    </div>
    <div class="custom-body">...</div>
    <div class="custom-footer">...</div>
  </div>
</div>

// After:
<div class="sparkle-modal">
  <div class="sparkle-modal-overlay"></div>
  <div class="sparkle-modal-content size-small">
    <div class="sparkle-modal-header">
      <h3>Title</h3>
      <button class="sparkle-modal-close">&times;</button>
    </div>
    <div class="sparkle-modal-body">...</div>
    <div class="sparkle-modal-footer">...</div>
  </div>
</div>
```

### 2. Update Button Classes
Replace custom button classes with shared ones:
```javascript
// Before:
<button class="custom-btn-primary">Save</button>
<button class="custom-btn-cancel">Cancel</button>

// After:
<button class="btn-primary">Save</button>
<button class="btn-secondary">Cancel</button>
```

### 3. Update Detail Rows (if applicable)
```javascript
// Before:
<div class="custom-detail-row">
  <div class="custom-label">Label:</div>
  <div class="custom-value">Value</div>
</div>

// After:
<div class="detail-row">
  <div class="detail-label">Label:</div>
  <div class="detail-value">Value</div>
</div>
```

### 4. Update CSS Injection
Remove the large CSS injection function and replace with minimal modal-specific styles:
```javascript
// Before:
function injectCustomModalStyles() {
  // ... 300+ lines of CSS ...
}

// After:
function injectCustomModalStyles() {
  if (document.getElementById('customModalStyles')) return;

  const style = document.createElement('style');
  style.id = 'customModalStyles';
  style.textContent = `
    /* Only modal-specific overrides here */
    .custom-specific-class {
      /* ... */
    }
  `;
  document.head.appendChild(style);
}
```

### 5. Update querySelector Calls
Update any selectors that reference the old class names:
```javascript
// Before:
const closeBtn = this.element.querySelector('.custom-close');
const overlay = this.element.querySelector('.custom-overlay');

// After:
const closeBtn = this.element.querySelector('.sparkle-modal-close');
const overlay = this.element.querySelector('.sparkle-modal-overlay');
```

## Retrofit Procedure for HTML Views

For each HTML view file (list_view.html, inspector.html, monitor.html, admin.html):

### 1. Ensure sparkle-base.css is Loaded
Check that sparkle-base.css is included in the `<head>`:
```html
<link rel="stylesheet" href="sparkle-base.css">
```

### 2. Review Custom Styles
Look for any `<style>` blocks or inline styles that duplicate what's in sparkle-base.css and remove them.

### 3. Update Class Names
If the view uses any modal-like components, update them to use shared classes.

## Testing After Retrofit

For each retrofitted file, verify:
- [ ] Modal opens and displays correctly
- [ ] All buttons are styled correctly
- [ ] Dark mode works (if applicable)
- [ ] No visual regressions
- [ ] No console errors
- [ ] Event handlers still work

## Benefits of Shared CSS

1. **Consistency** - All modals have the same look and feel
2. **Maintainability** - Update styles in one place
3. **Reduced Code** - Eliminate ~1000+ lines of duplicate CSS
4. **Performance** - Single CSS file loaded once, cached by browser
5. **Dark Mode** - Centralized theme management with CSS variables
6. **Future-Proof** - Easy to add new shared components

## Timeline

- **After item-editor-new.js testing passes**: Retrofit dependency-manager.js and item-creator.js
- **After all modals work**: Update HTML views to ensure shared CSS is loaded
- **Final check**: Remove old CSS files/injection code

## Notes

- Keep modal-specific styles minimal (just overrides)
- Use CSS variables from `:root` and `body.dark-mode` for theming
- Test in both light and dark modes
- Verify on different screen sizes
