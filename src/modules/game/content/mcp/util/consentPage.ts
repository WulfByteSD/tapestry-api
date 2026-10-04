/** Escape all untrusted client metadata and browser parameters before including them in the consent form. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** A minimal server-rendered sign-in/consent form keeps the initial feature inside the API project. */
export function consentPage(clientName: string, scopes: string[], intent: string, csrf: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tapestry agent connection</title></head><body>
    <main><h1>Connect an agent to Tapestry</h1><p>Client: <strong>${escapeHtml(clientName)}</strong></p>
    <p>Requested operations: ${escapeHtml(scopes.join(', '))}. Your administrator's content and setting restrictions also apply.</p>
    <p>Sign in with the approved Tapestry account. Your password is never shared with this client.</p>
    <form method="post"><input type="hidden" name="intent" value="${escapeHtml(intent)}"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
    <p><label>Email <input type="email" name="email" autocomplete="username" required></label></p>
    <p><label>Password <input type="password" name="password" autocomplete="current-password" required></label></p>
    <button type="submit" name="decision" value="approve">Sign in and approve</button>
    <button type="submit" name="decision" value="deny" formnovalidate>Decline connection</button></form></main></body></html>`;
}
