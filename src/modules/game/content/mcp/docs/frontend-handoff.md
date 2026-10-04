# Secure content MCP — frontend implementation handoff

## Goal and delivery scope

Build the human administration interface in `tapestry-frontend/apps/admin` for
registering AI applications, issuing scoped grants, reviewing content proposals,
and inspecting audit history. The backend implementation exists in
`tapestry-api/src/modules/game/content/mcp`.

Deliver admin UI and app-local API/types/hooks. Follow the workspace, frontend,
and admin `AGENTS.md` instructions. Reuse the existing protected layout, UI
components, styling, authentication session, and React Query conventions. This
handoff does not require player-app changes or a new shared authentication system.
Keep library text and proposal rationale as content data; do not execute it or
render unsanitized HTML. No canon/PDF verification feature is provided.

The API already serves interactive OAuth sign-in/consent. This admin UI manages
preregistration and grants; it does not collect account passwords for an agent,
implement an OAuth authorization server, or impersonate an agent to call MCP tools.

## Existing frontend entry points

Paths below are relative to `tapestry-frontend` and were checked for this handoff:

| File / area | Use |
| --- | --- |
| `apps/admin/src/app/(protected)` | Existing Next.js protected pages/layout |
| `apps/admin/src/components/adminShell/AdminShell.component.tsx` | Add a scoped navigation entry; suggested label **AI connections** |
| `apps/admin/src/lib/api.ts` | Existing API origin and app token store |
| `apps/admin/src/lib/auth-hooks.ts` | Existing `useMe` / authentication hooks |
| `apps/admin/src/lib/content-admin` | App-local API/types/hooks patterns and existing content/settings access |
| `apps/admin/src/lib/player-admin/playerAdmin.hooks.ts` | Existing account/profile lookup patterns; resolve the Auth account ID |
| `packages/api-client/src/http/client.ts` | Understand the shared client's extra headers before reusing it |

Suggested new locations: `apps/admin/src/app/(protected)/ai-connections` for pages,
`apps/admin/src/views/ai-connections` for UI, and `apps/admin/src/lib/mcp-admin`
for typed transport and query hooks. These are proposed frontend routes, not
existing backend URLs. Preserve app conventions if a nearby feature uses a better
local pattern. Avoid expanding shared packages solely for this admin feature.

## Deployment and transport contract

See [content-mcp.md](./content-mcp.md) for the full ENV explanation. The API must
enable MCP and include the admin website's exact HTTPS origin in
`CONTENT_MCP_ORIGINS`. The admin app keeps its existing public
`NEXT_PUBLIC_API_ORIGIN` value. No agent client secret or `JWT_SECRET` belongs in
frontend build variables.

The REST base is `/api/v1/game/content/mcp/admin`. Authenticate with the current
human app JWT as `Authorization: Bearer <app-token>`. Use JSON request bodies.
If using an API client already prefixed with `/api/v1`, pass paths beginning
`/game/content/mcp/admin` to avoid duplicating the prefix.

**Current CORS integration detail:** the shared Axios client adds
`X-Service-Name` and `x-session-id`. The MCP middleware's allowed request headers
do not include those. Browser cross-origin calls through that client unchanged
will fail preflight. Use an app-local MCP REST adapter that gets the current token
from the existing token store and sends only `Authorization`, `Content-Type`, and
optionally `Accept`. For example, a scoped fetch wrapper can read `tokenStore.get()`
at request time and send the bearer header, with cookies omitted. Do not change the
shared client's global headers for the other admin/player features. A backend CORS
extension would be a separate integration change if the team prefers that approach.

The admin endpoint uses bearer headers and does not need the OAuth consent cookie.
Do not replace the human token with an MCP access token in the shared token store.

## Human permissions

The backend requires an active, email-verified Auth account. It resolves current
roles/permissions from the persisted Auth and Admin profile records:

- Auth role `admin`, or Admin profile role `admin` / `developer`: management and review.
- `mcp:manage` in either persisted permission list: clients, grants, and audit.
- `mcp:review` in either persisted permission list: proposal list/detail/decisions.

Gate navigation/actions using available current session/profile data, while
treating backend responses as authoritative. A reviewer-only account must be able
to review proposals without fetching manager-only client/grant/audit lists; show
raw client/account/grant identifiers when richer labels are unavailable. An account
with only `mcp:manage` cannot review proposals. Never infer privileges from a client
name, grant capabilities, or the mere ability to open the admin shell.

There is currently no MCP `me`, permission-summary, or feature-status endpoint.
Do not invent one. A route-level 404 can mean MCP is disabled or not deployed;
distinguish that from a 404 for a particular proposal record.

## Response shapes and identifiers

Successful admin responses have this envelope:

```ts
type Success<T> = { success: true; payload: T };
type Page<T> = { records: T[]; page: number };
type ApiError = { error: string; error_description: string };
type ContentType = 'items' | 'skills' | 'abilities' | 'settings' | 'lore' | 'combatants';
type Capability = 'read' | 'propose' | 'create' | 'update' | 'bulk' | 'publish'
  | 'read:draft' | 'read:archived';
```

Read Axios responses through `res.data.payload`, or parse the fetch JSON envelope.
Errors use `error` / `error_description`, not the app's other `message` formats.
The server rejects unknown body and query fields: construct DTOs explicitly, and
never send an entire returned database record back as an update.

Dates are ISO strings; Mongo IDs are strings. Returned documents can also include
timestamps, `__v`, or internal counters. Do not bind those as editable form fields.

| Identifier | Meaning |
| --- | --- |
| Client `clientId` | External OAuth identifier; use in client route paths and grants |
| Client `_id` | Mongo record ID; do not use instead of `clientId` in client routes |
| Grant `_id` | ID used in grant update/revoke routes |
| Grant `ownerId` | Auth account ID, not player/Admin profile ID or email |
| Proposal `_id` | ID used in proposal detail/decision routes |
| Setting key | Domain `key`, not setting Mongo `_id` |

Encode dynamic path components with `encodeURIComponent`.

## Exact REST endpoints

All paths below are relative to `/api/v1/game/content/mcp/admin`.

| Method / path | Human permission | Body or result |
| --- | --- | --- |
| GET `/clients` | manage | `Success<Page<Client>>` |
| POST `/clients` | manage | Client registration DTO; returns client, possibly one-time `clientSecret` |
| PUT `/clients/:clientId` | manage | `{ operationId, name?, redirectUris?, isActive? }`; returns client |
| POST `/clients/:clientId/rotate-secret` | manage | `{ operationId }`; returns `{ clientId, rotated: true, clientSecret? }` |
| GET `/grants` | manage | `Success<Page<Grant>>` |
| POST `/grants` | manage | Grant creation DTO; returns grant |
| PUT `/grants/:id` | manage | `{ operationId, capabilities?, contentTypes?, settingKeys?, shared?, expiresAt?, isActive? }`; returns grant |
| POST `/grants/:id/revoke` | manage | `{ operationId }`; returns inactive grant |
| GET `/proposals` | review | `Success<Page<Proposal>>` |
| GET `/proposals/:id` | review | `Success<Proposal>` |
| POST `/proposals/:id/approve` | review | `{ operationId, note? }`; returns applied proposal |
| POST `/proposals/:id/reject` | review | `{ operationId, note? }`; returns rejected proposal |
| GET `/audit` | manage | `Success<Page<AuditEvent>>` |

Lists accept `page` (default 1, maximum 10000), `limit` (default 25, maximum 50).
Proposal lists additionally support `state=pending|applied|rejected`. Results are
newest-first. There is **no total, hasMore, server-side text search, client/owner
filter, or client/grant detail GET**. Fetch pages for client/grant selection and
use already fetched records for editing. If a page is full, permit fetching the
next page; an empty next page is possible. Label any local filtering as filtering
the loaded records only. Do not pass the generic advanced-filter query format.

## Screen 1: AI connections and registration

List name, client ID, machine/interactive type, confidential/public status, active
state, and created date. Offer register, edit name/callbacks, disable/enable, and
confidential-secret rotation. There is no delete endpoint, no editable client ID,
and no change of kind/confidential mode after creation.

Registration DTO:

```ts
type RegisterClient = {
  operationId: string;
  clientId?: string; // omit to let the API generate it; otherwise 1–128 chars
  name: string; // trimmed, 1–100 chars
  kind: 'machine' | 'interactive';
  confidential: boolean;
  redirectUris: string[]; // maximum 10
};
```

Machine clients must be confidential and have zero callbacks. Interactive clients
need at least one exact callback and may be public or confidential. A desktop or
browser-only app should use a public client because it cannot keep a confidential
secret. Server applications can use confidential clients. Callbacks accept HTTPS
or explicit HTTP loopback (`localhost`, `127.0.0.1`, `[::1]`), with no wildcard,
fragment, or embedded credentials. Paths, query strings, and ports match exactly.

Registration creates the client only. Show a clear **Create access grant** next
step; do not label registration itself as working access. Public clients receive
no secret. Confidential clients display a one-time secret panel with explicit
copy action and a “saved securely” completion step. Keep the secret in short-lived
component memory, clear on dismissal/unmount, and exclude it from query caches,
persisted state, URLs, logs, telemetry, and notification text. If a mutation library
retains results, reset its secret-bearing mutation state after dismissal.

If the response is lost or an identical retry lacks `clientSecret`, show that the
secret cannot be recovered and offer a fresh rotation action. A rotation or
disable action should explain that existing tokens will stop working. Callback
updates also revoke existing authorizations; omit `redirectUris` when unchanged
so editing a name does not unnecessarily revoke connections. Re-enabling a client
does not revive revoked tokens: it must authenticate again.

## Screen 2: scoped access grants

Offer a grant wizard/edit form with client, accountable owner, expiry, allowed
content types, allowed setting keys, shared-content toggle, and capabilities.
Start with `read` + `propose`, `shared: false`, and deliberate setting selection.
Do not silently select every setting or enable publishing/direct writes.

```ts
type CreateGrant = {
  operationId: string;
  clientId: string;
  ownerId: string; // 24-character Auth ID; active and email-verified
  capabilities?: Capability[]; // defaults to ['read', 'propose']; must include read
  contentTypes: ContentType[]; // at least one; maximum six
  settingKeys: string[]; // maximum 100; each trimmed key 1–128 chars
  shared?: boolean; // defaults false
  expiresAt: string; // future UTC ISO datetime, e.g. Date.toISOString()
};
```

Use existing account/settings APIs for selectors where permitted. Existing player
lookup APIs may not enumerate every Auth account, so confirm the returned Auth ID
before submission; an explicitly labeled Auth-ID input is an acceptable fallback.
There is no MCP owner-directory endpoint. A setting selector should support exact
key entry as well: administrators can preauthorize a future setting key for an
agent allowed to create settings. Referencing that setting from another record
still requires it to exist first.

The server derives grant kind from the client; do not send `kind`. There is one
grant per machine client, and one per interactive client/account pair. The unique
constraint includes expired/inactive grants: edit/reactivate the existing grant
instead of creating a duplicate. Client/owner identity is immutable on edit.

| Capability | Explain in the UI |
| --- | --- |
| `read` | Required; reads published content within the allowed types/settings |
| `propose` | Submits suggestions for human review; grants no direct content writes |
| `create` | Direct creation; new records default to draft |
| `update` | Direct updates using the record's revision |
| `bulk` | Up to 50 operations per call; also needs propose or relevant direct capabilities |
| `publish` | Also required for direct publishing and any direct edit to published content |
| `read:draft` | Read draft records |
| `read:archived` | Read archived records; does not enable archival or editing archived records |

Every setting attached to a record must be allowed. Empty setting membership or
the `shared` marker requires the separate shared toggle. Do not put `shared` in
`settingKeys`. An empty key list with shared disabled grants no setting access.
Referenced types/settings must be readable too: for example, authoring items
requires access to their setting, and items granting abilities require readable
abilities. Explain these dependencies rather than silently widening the grant.

Grant update arrays replace the full array. Send only fields actually being
changed. Convert expiry from the user's local input to a fixed UTC string before
submitting; do not recompute it on retries. Show expired, revoked, and active states
separately. An active grant can still be unusable if its client/owner is inactive
or its owner is unverified; do not imply a connection health check exists.

Revocation takes effect on current tokens and blocks approval of pending proposals
from that grant. Expanding capabilities requires the agent to obtain a new token
requesting them. Current type/setting restrictions are reevaluated on each request.

## Screen 3: proposal review

Default the queue to pending; provide applied/rejected history. Display client,
owner/grant identifiers, content type, create/update action, rationale, submitted
date, and intended publication status. Detail should show the **stored normalized
operation**, not an editable authoring form.

```ts
type Operation =
  | { type: ContentType; action: 'create'; data: Record<string, unknown> }
  | { type: ContentType; action: 'update'; id: string; revision: string;
      data: Record<string, unknown> };
type Proposal = {
  _id: string; grantId: string; clientId: string; ownerId: string;
  operation: Operation; rationale: string;
  settingKeys: string[]; requiresShared: boolean;
  state: 'pending' | 'applied' | 'rejected';
  createdAt: string; updatedAt: string;
  reviewedBy?: string; reviewedAt?: string; reviewNote?: string;
  result?: { id: string; type: ContentType; status: string; revision: string };
};
```

Proposal `settingKeys` captures original/resulting scope and is not necessarily
the resulting record's membership. `requiresShared` is a historical access
requirement. Both are read-only metadata. Update `data` is a patch; missing fields
are unchanged. Object fields merge, arrays replace, and explicit null replaces.

For an update, optionally fetch current content through existing admin content
APIs for a clearly labeled **current content / proposed patch** comparison. There
is no original-content snapshot in the proposal and no admin preview/diff endpoint.
Do not present current content as the historical version the agent read. Show the
stored revision and let the backend perform the authoritative stale check.

Approve/reject take only `operationId` and optional `note` (maximum 10000 chars).
The payload cannot be edited or substituted during approval. A human reviewer may
approve publication even if the agent has only propose permission, so explicitly
surface published creations and updates to published records before approval.
There is no separate draft-save, approve-with-edits, force-approve, bulk-approve,
or proposal-delete endpoint.

On success, update the detail state and invalidate proposal lists and affected
content queries. On stale revision conflict, keep the pending proposal visible,
explain that the agent must reread and submit a new proposal, and allow rejection
of the stale one. Never fall back to ordinary REST writes to bypass approval's
permissions/revision checks. Concurrent review conflicts should refetch detail
and display the server's existing decision.

## Screen 4: audit history and connection instructions

Audit events include `_id`, `createdAt`, `event`, and optional `actorKey`,
`clientId`, `ownerId`, `grantId`, `operationId`, `target`, `code`, `before`, `after`.
Show an event timeline/table with expandable escaped JSON snapshots. These are
application events, not a guarantee of comprehensive infrastructure logging.
No server-side audit filters beyond page/limit exist today.

Provide a copyable MCP endpoint and instructions for registered clients. A machine
agent uses client ID/secret to request a short-lived token from `/oauth/token`;
an interactive app starts the API's S256 PKCE sign-in/consent flow with its exact
registered callback. Link the operator guide for the precise exchange fields.
Only preregistered OAuth clients are supported; do not offer anonymous connection
or automatic public registration. Do not test a confidential client by storing or
exchanging its secret in the admin browser.

## Operation IDs, retries, and errors

Generate one `crypto.randomUUID()` per deliberate mutation. IDs allow 1–128
characters from `[A-Za-z0-9:_-]` and are scoped to the human administrator across
all mutation routes. Preserve the ID and exact DTO during an uncertain network
retry. Use a new ID for changed input or a new user action. Disable double-submit
while pending. Identical committed retries return their recorded result; changing
the payload with the same ID produces 409. Secrets are intentionally absent from
registration/rotation replay responses.

| Response | UI behavior |
| --- | --- |
| 400 `validation` | Show `error_description`; preserve form input. Errors are not guaranteed to include per-field issue arrays. |
| 401 `invalid_token` | Verify current human session before prompting sign-in. During approval this can also mean the proposing agent's connection is revoked/expired, so do not blindly log out a valid reviewer. |
| 403 `forbidden` | Explain missing permission; retain read-only context where authorized. Host/origin configuration can also cause transport denial. |
| 404 | Missing record, or feature not deployed/enabled for route-level failures. Avoid endless retries. |
| 409 `duplicate` | Existing client ID/grant/content key; help locate the existing record. |
| 409 `conflict` | Payload reuse, stale content, or an already-reviewed proposal; use action-specific handling and refetch. |
| 429 `rate_limited` | Honor `Retry-After` (currently 60 seconds); avoid aggressive polling. |
| 503 `transactions_required` | Explain that backend transaction-capable MongoDB is required; the form cannot repair it. |
| 503 `unavailable` | Preserve inputs; allow an explicit retry using the same ID/DTO. Never report success optimistically. |

Frontend/HTTP logs must redact Authorization and one-time secret responses.
Do not send MCP registration/rotation payload responses to generic debug logging.
Use short human-facing messages; keep raw proposal/library content escaped.

## Acceptance checks for the frontend implementation

1. Existing human authentication works; disallowed users see a permission state.
   Manager-only and reviewer-only accounts can use their own sections independently.
2. Cross-origin preflight succeeds from the configured admin origin without the
   shared client's unsupported custom headers.
3. Machine and interactive registration forms enforce the different callback and
   secret requirements. Registration clearly leads to a separate grant step.
4. Secret appears once, is copyable, and is cleared after dismissal. Lost-response
   retries lead to rotation, not a fake “reveal secret” action.
5. Grants use Auth IDs and setting keys, require future expiry/read permission,
   default to proposal access, and present shared/publishing permissions explicitly.
6. Updating a name alone omits unchanged callbacks. Disable, revoke, and rotation
   explain the effect on current connections and refresh visible metadata afterward.
7. Proposal review shows normalized content, rationale, revision and publication
   impact; stale/concurrent outcomes cannot accidentally overwrite content.
8. Pagination works without invented totals/filters, and reviewer-only views do
   not depend on manager-only endpoints.
9. Mutation retry reuses the exact DTO and ID; altered submissions use a fresh ID.
10. Loading, empty, forbidden, disabled/unavailable, rate-limited, and error states
    are handled. Keyboard interaction/focus works for forms, dialogs, and secret copy.

Run the admin app's existing type/build checks and any applicable existing tests.
Verify the two human permission roles against an enabled development API. The
backend has integration coverage for OAuth, proposals, permission boundaries,
idempotency, concurrency, and rollback; frontend validation still needs browser
checks for origin policy, workflow state, and secret handling.

## Backend source references

Relative to this document:

- [Admin route definitions](../route/admin.ts)
- [Strict admin request DTOs](../util/adminContracts.ts)
- [Admin response controllers](../service/McpAdmin.service.ts)
- [Client/grant/review handlers](../handlers/McpAdmin.handler.ts)
- [Human permission checks](../middleware/McpAuth.middleware.ts)
- [Host/origin/error policy](../middleware/McpSecurity.middleware.ts)
- [Environment validation](../util/mcpConfig.ts)
- [Proposal model](../model/McpProposal.ts)
- [Content validation](../handlers/ContentValidation.handler.ts)

Treat these files as the implemented contract if the API changes after this
handoff. Missing endpoints described above are integration constraints, not tasks
to silently implement by bypassing backend controls.
