# Adventure reference API

Base path: `/api/v1/game/adventures`. Every endpoint requires the existing authenticated account middleware. Responses use `{ success: true, payload }` except successful deletes (204). Responses are private/noncacheable. No frontend, progress tracking, encounter instances, cross-adventure reuse, personal upload library, or payment flow is introduced.

## Ownership and authoring

An adventure references exactly one existing library Resource through immutable `libraryResourceId`; the relationship is unique. The Resource must have `kind: module` and `accessPolicy: entitlement`. Publication also requires that Resource to be published. Create the Resource and a product granting it through the existing library/commerce admin APIs. Free acquisitions continue through `POST /api/v1/commerce/products/:productId/claim`. The existing Resource Access Grant (RAG) belongs to the Player profile resolved from the authenticated account. All adventure ownership checks require an active, unexpired grant containing `view`. Free pricing never bypasses the grant check. No additional grants are needed for individual included materials.

Admin routes require the account's `admin` permission. Normal owner routes do not provide an admin bypass; admins preview drafts through the admin routes. Campaign `sw`/`co-sw` roles alone do not grant ownership.

| Method/path | Contract |
| --- | --- |
| `GET /admin?page=0` | Admin summaries, 50 per page, stable ID order |
| `POST /admin` | `{ libraryResourceId, content }`; creates a draft |
| `GET /admin/:id` | Admin preview, including private content but no storage identifiers |
| `PUT /admin/:id` | `{ revision, content }`; replaces the working draft atomically, leaving published content unchanged |
| `PATCH /admin/:id/status` | `{ revision, status: published\|archived }` |
| `DELETE /admin/:id` | `{ revision }`; deletes a never-published draft; archive published modules |
| `POST /admin/:id/resources/:resourceId/asset?revision=N` | Raw attachment bytes, `Content-Type: application/octet-stream`, maximum 10 MiB; changes the working draft only |
| `GET /admin/:id/resources/:resourceId/asset` | Admin-only protected attachment preview |
| `DELETE /admin/:id/resources/:resourceId/asset` | `{ revision }`; removes the working draft attachment without deleting published/provider bytes |
| `GET /?page=0` | Entitled, published module summaries, 50 per page |
| `GET /:id` | Full entitled adventure reference |
| `GET /:id/sections/:sectionId` | Section plus its contextual materials and recommended encounters |
| `GET /:id/resources?sectionId=a&kind=map&tag=dungeon` | Independent material library with optional filters |
| `GET /:id/resources/:resourceId` | Entitled individual material |
| `GET /:id/resources/:resourceId/asset` | Entitled protected attachment bytes |

Revision numbers are returned by reads and incremented by authoring writes, publication, and uploads. Stale revisions return 409. Content replacement preserves server-managed attachments for retained material IDs of the same kind. IDs should remain stable; deleting a material also requires removing its section associations. Removed/replaced authenticated assets are not automatically purged from the provider, avoiding destructive deletion on uncertain outcomes. Storage cleanup is a separate operational task.

Published content is a separate snapshot inside the adventure. Editing or uploading changes only the working draft. Publishing atomically replaces that snapshot for all existing owners and shared-resource recipients; no new claim is needed and there are no per-owner pinned editions. Owner lists, section/resource reads, and attachment delivery use only the published snapshot. An archive hides published content from both owners and campaign members until republished. Existing shares retain their material IDs; a newly published deletion or change to private visibility makes those materials unavailable through campaign sharing.

## Content shape

`content` contains:

- `title`, `summary`.
- `sections`: `{ id, title, storyText, storyweaverNotes, context, sortOrder, resourceIds, encounterIds, links }`. Each link is `{ sectionId, label, context }`. These links explain navigation and context; no completion/precondition gate exists. Skips, cycles, and revisits are valid.
- `resources`: `{ id, title, kind, visibility, text, tags }`. Kinds: `map`, `handout`, `story_text`, `storyweaver_note`. Visibility defaults to `storyweaver`; `players` makes a resource eligible for explicit sharing, not automatically shared. Storyweaver notes cannot have player visibility. Zero or multiple materials are allowed, including materials without section associations.
- `encounters`: `{ id, title, notes, combatants: [{ combatantId, quantity }] }`. These are recommendations referencing existing canonical combatants, with positive suggested quantities. Combatants must exist and not be archived; publishing requires them to be published. The frontend may use these references to prepare or adjust its own encounter queue. No combatant state is copied or mutated.

Section/material/encounter IDs are lowercase alphanumeric keys with optional `_`/`-`, unique within their collection and scoped to the module. Associations must resolve in that same module. Unknown fields, client-supplied asset keys/URLs, duplicate IDs, dangling associations, and malformed combatant references are rejected. Text is plain text: clients must render it as text, not unsanitized HTML. Section story text is part of the private reference; to reveal a passage, author an explicit player-shareable `story_text` material and associate it with the section.

Limits: 200 sections, 200 materials, 100 encounter recommendations, 100 combatant entries per encounter, 100,000 characters per long text field, and 2 MB serialized content. The adventure JSON parser is separately limited to 2 MiB; all other API JSON limits are unchanged. There are no required sections, progression steps, or resources. A map needs a protected attachment before publication.

## Explicit campaign sharing

| Method/path | Contract |
| --- | --- |
| `PUT /campaigns/:campaignId/:id/resources/:resourceId` | Attach a selected share-safe material; idempotent |
| `DELETE /campaigns/:campaignId/:id/resources/:resourceId` | Unshare; idempotent |
| `GET /campaigns/:campaignId/resources` | List only explicitly shared, safe, published materials |
| `GET /campaigns/:campaignId/:id/resources/:resourceId` | Read one safe material |
| `GET /campaigns/:campaignId/:id/resources/:resourceId/asset` | Stream that material's attachment |

Sharing requires the module entitlement and an active campaign where the caller is owner, `sw`, or `co-sw`. Unsharing requires campaign management authority, even if the caller no longer owns the module. An ordinary campaign member cannot share. Opening a section never shares anything.

Derived reads check current campaign existence, `active` status, membership/ownership, explicit resource attachment, material visibility, both adventure/library publication, and the supplying Storyweaver's current module entitlement. Revoked, expired, removed, or view-less supplier grants stop derived list/detail/attachment access. Removed members, deleted campaigns, draft/archived campaigns, and unshared resources also lose derived access. Independent module entitlement still permits safe individual-resource reads through the campaign route even after the campaign disappears; full owner routes remain available. Campaign lists require a current active campaign membership and only list shared material. Independently entitled members can see those shared materials even if the supplier loses access. Campaign routes never expose Storyweaver notes, full section text, encounters, associations, storage identifiers, or unrelated/unrevealed material.

Shares are campaign attachments rather than new account grants. Each resource share records `sharedByPlayerId`, the supplying Storyweaver's Player profile. Losing that profile's module entitlement makes its shares inaccessible to nonowners. A valid regrant to the same profile restores access to still-attached resources; checks use current ownership, not a pinned grant ID. An unrelated owner's entitlement never silently sponsors a share. Repeating a share does not change its supplier; explicitly unshare and share again to change the supplier. A newly shared different resource has its own supplier. No account-wide ownership is granted to recipients. The generic campaign PUT/DELETE routes require campaign-management authority because those routes can otherwise bypass membership/status boundaries.

## Protected delivery

Only admin-authored map/handout attachments are uploaded here. The endpoint accepts raw bytes with PNG/JPEG/WebP/PDF signatures, rejects HTML/SVG and over-limit input, and stores files using the existing Cloudinary account with `type: authenticated`. It does not reuse the existing ordinary public-upload helper. Public IDs are created server-side under the module/material namespace and are not accepted from clients.

Asset responses contain metadata plus `hasAsset`, never provider URLs or keys. The backend rechecks access for each attachment request, consumes a short-lived signed provider URL itself, disallows upstream redirects, and streams bytes with `Cache-Control: private, no-store`, `nosniff`, and attachment disposition. Provider errors are replaced with generic messages to avoid leaking signed URLs. No permanent public delivery URL is emitted. Revocation stops subsequent API reads; bytes already downloaded cannot be revoked.

Cloudinary documents authenticated uploads and time-limited private download URLs in its [Upload API reference](https://cloudinary.com/documentation/image_upload_api_reference#private_download_url_syntax). This code uses those mechanisms, not merely hidden public URLs. Live Cloudinary configuration/delivery has not been exercised by the automated tests. No live assets or credentials are needed for the unit suite. Deployment should verify authenticated raw upload/download support using a controlled nonproduction account before enabling file delivery; no account security setting or credentials were created or changed here.

## Verification

Unit/router tests use mocked persistence and storage without starting an HTTP listener. The optional integration suites start an isolated temporary MongoDB only when `ADVENTURE_TEST_MONGO_BINARY` explicitly points to an already-installed binary; they never use application connection strings or download a binary. They exercise real document persistence, grant expiry/revocation, unique concurrent shares, removed membership, campaign deletion/status, and owner fallback. The HTTP suite also uses a temporary loopback listener, synthetic JWTs, and actual authentication, adventure, campaign, and commerce routers to verify authorization, campaign roles, free claims, and draft publication boundaries. External storage is mocked in every suite.

For a fresh rollout, no existing application records need a migration. New collections are `adventures` and `adventure_campaign_shares`; unique indexes enforce one module per library Resource and one share per campaign/module/resource. Use the project's normal index provisioning before accepting concurrent production writes. This refactor replaces the earlier undeployed share-set layout with individual attributed shares: if that earlier layout was locally provisioned, its two-column unique index must be replaced with the three-column index, and unattributed shares must be explicitly recreated. Never infer a supplier from another owner's grant; legacy unattributed records fail closed. No live index build, migration, seed, or database mutation was performed.

## File responsibilities

- `routes/index.ts` mounts authenticated groups; `admin.routes.ts`, `reference.routes.ts`, and `campaignResources.routes.ts` only register routes and delegate to services.
- `services/AdventureAdmin.service.ts`, `AdventureReference.service.ts`, and `AdventureCampaign.service.ts` translate HTTP requests, call handlers, and format responses through the existing `asyncHandler` convention. `AdventureAttachment.service.ts` orchestrates upload/persistence/cleanup and authenticated byte streaming. Any future event publishing belongs in these services.
- `handlers/AdventureAuthoring.handler.ts` handles draft CRUD and publication; `AdventureReference.handler.ts` handles published reference queries; `AdventureAccess.handler.ts` handles current entitlement and campaign authorization; `AdventureSharing.handler.ts` handles attributed campaign shares; `AdventureAttachment.handler.ts` handles attachment eligibility and revision-safe persistence; `AdventureStorage.handler.ts` handles protected Cloudinary operations. Handlers do not accept Express requests/responses.
- `models/` owns persistence schemas and indexes, `types/` owns content contracts, and `helpers/` owns validation/projections and authenticated actor extraction.
- Campaign mutation authorization follows the same boundary: routing delegates to `CampaignMutation.service.ts`, whose focused `CampaignMutation.handler.ts` checks the established owner/SW/co-SW roles.
