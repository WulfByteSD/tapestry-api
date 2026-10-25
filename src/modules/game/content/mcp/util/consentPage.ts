import { consentStyles } from './consentPage.styles';

/** Escape all untrusted client metadata and browser parameters before including them in the consent form. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Display copy only: scope order and values always come from the validated consent intent. */
const scopeDescriptions = new Map<string, readonly [string, string]>([
  ['read', ['Read content', 'Search and view permitted published content.']],
  ['propose', ['Propose changes', 'Submit content changes for human review.']],
  ['create', ['Create content', 'Create content directly within the approved grant.']],
  ['update', ['Update content', 'Change existing content within the approved grant.']],
  ['bulk', ['Batch operations', 'Submit multiple content operations together.']],
  ['publish', ['Publish content', 'Publish content or change published records.']],
  ['read:draft', ['Read drafts', 'Include unpublished drafts in permitted reads.']],
  ['read:archived', ['Read archived content', 'Include archived records in permitted reads.']],
]);

/** A script-free HTML template compiled with the API, independent of production asset paths. */
export function consentPage(clientName: string, scopes: string[], intent: string, csrf: string): string {
  const permissions = scopes
    .map((scope) => {
      const [label, description] = scopeDescriptions.get(scope) || ['Requested permission', 'Review this operation before approving the connection.'];
      return `<li class="permission">
      <div class="permission-heading"><strong>${escapeHtml(label)}</strong><code><bdi>${escapeHtml(scope)}</bdi></code></div>
      <p>${escapeHtml(description)}</p>
    </li>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tapestry agent connection</title>
  <style>${consentStyles}</style>
</head>
<body>
  <div class="shell">
    <header class="brand" aria-label="Tapestry">
      <span class="wordmark">Tapestry</span>
      <span class="tagline">Stories woven through the Threads of Fate</span>
    </header>
    <main aria-labelledby="page-title">
      <p class="eyebrow">Agent authorization</p>
      <h1 id="page-title">Connect an agent to Tapestry</h1>
      <p class="intro">Review what this agent is requesting, then sign in to approve the connection.</p>
      <div class="connection">
        <section class="review" aria-labelledby="review-title">
          <h2 class="step" id="review-title"><span class="step-number" aria-hidden="true">01</span> Review the connection</h2>
          <p class="client-label">Requesting agent</p>
          <p class="client-name"><bdi>${escapeHtml(clientName)}</bdi></p>
          <h2 class="permissions-title" id="permissions-title">Requested permissions</h2>
          ${scopes.length ? `<ul class="permissions" aria-labelledby="permissions-title">${permissions}</ul>` : '<p class="restriction">No permissions were requested.</p>'}
          <p class="restriction">Your administrator's content and setting restrictions also apply.</p>
        </section>
        <section class="account" aria-labelledby="account-title">
          <h2 class="step" id="account-title"><span class="step-number" aria-hidden="true">02</span> Authorize with your account</h2>
          <h2>Sign in to Tapestry</h2>
          <p class="account-intro" id="account-help">Use the Tapestry account approved for this agent connection.</p>
          <form method="post" aria-describedby="account-help privacy-note">
            <input type="hidden" name="intent" value="${escapeHtml(intent)}">
            <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
            <div class="fields">
              <div class="field">
                <label for="email">Email</label>
                <input id="email" type="email" name="email" autocomplete="username" required aria-describedby="email-error">
                <p class="field-error" id="email-error">Enter a valid email address.</p>
              </div>
              <div class="field">
                <label for="password">Password</label>
                <input id="password" type="password" name="password" autocomplete="current-password" required aria-describedby="password-error privacy-note">
                <p class="field-error" id="password-error">Enter your password.</p>
              </div>
            </div>
            <p class="privacy" id="privacy-note">Your password is never shared with this client.</p>
            <div class="actions">
              <button class="approve" type="submit" name="decision" value="approve">Sign in and approve</button>
              <button class="deny" type="submit" name="decision" value="deny" formnovalidate>Decline connection</button>
            </div>
            <p class="decline-note">You can decline without signing in.</p>
          </form>
        </section>
      </div>
    </main>
    <footer>Only connect agents you recognize and trust.</footer>
  </div>
</body>
</html>`;
}
