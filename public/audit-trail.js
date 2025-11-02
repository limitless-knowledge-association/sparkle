/**
 * Sparkle Audit Trail
 * Opens audit trail in a new window (no longer a modal)
 */

/**
 * Open the audit trail for a specific item in a new window
 * @param {string} itemId - The item ID
 */
export function openAuditTrail(itemId) {
  if (!itemId) return;

  // Get current window location to construct audit trail URL
  const currentUrl = window.location;
  const auditTrailUrl = `${currentUrl.origin}/audit_trail.html?itemId=${encodeURIComponent(itemId)}`;

  // Open in new window with reasonable size
  window.open(auditTrailUrl, `audit-trail-${itemId}`, 'width=1000,height=800,scrollbars=yes,resizable=yes');
}
