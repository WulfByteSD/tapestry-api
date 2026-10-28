# Product type and storefront media

`productType` is an optional additive designation on Commerce Products:

| Value | Primary storefront art | Delivery |
| --- | --- | --- |
| `book` | `presentation.coverImageUrl` | Digital, physical or mixed |
| `merchandise` | `presentation.productImageUrl` | Independent of presentation |
| `other` | `presentation.productImageUrl` | Digital, physical or mixed; suitable for maps, printables and other formats |

New products authored in Admin start with `other`; authors can select Book or
Merchandise in Basics. Existing records without a designation stay untyped until
an author chooses one. The API continues accepting omitted `productType` for
older clients. Supplied values must be one of the three enum values.

Resource categories (Guide, Module, Dial, Quickstart, Reference, Map, Printable,
Other) remain on Resources and are joined through product grants for existing
catalogue filtering. They do not infer product type. Pricing, shipping,
fulfillment kind, grants and entitlements remain independent and retain their
existing validation.

## Media contract

All fields are under `presentation`:

- `coverImageUrl`: book cover, used as the primary image only for Book.
- `productImageUrl`: primary photo/artwork for Merchandise or Other; displayed
  without book styling and with its full image contained in a neutral area.
- `bannerImageUrl`: optional distinct promotional image above product details.
  It is never substituted into the catalogue thumbnail or primary-image role.
- `gallery`: existing ordered `{ url, alt?, caption? }[]` supporting images.
  The viewer and thumbnails contain mixed aspect ratios without cropping.
- `imageUrl`: retained legacy, unassigned artwork. It is not a banner alias.

For an untyped legacy record, the neutral primary preview uses
`productImageUrl`, then `imageUrl`, then the historical `coverImageUrl`. This
does not designate the product as a book. Once explicitly typed, only that
type's primary role is used. Future unrecognized types use neutral presentation
and only `productImageUrl`, without reinterpreting legacy fields.

An absent banner removes the banner section. An absent or failed primary image
shows a type-appropriate text placeholder. Neither banners, galleries nor images
assigned to another role substitute for the missing primary role. An empty
gallery removes the gallery section. Images are not copied between roles.

## Editing and compatibility

The existing create/update product endpoints accept these fields; no endpoint
rename or response-envelope change is required. Admin Presentation exposes the
cover, product image, optional banner, existing gallery controls and any retained
legacy image. Choosing a type preserves media belonging to other roles, even
when that role is not currently displayed.

Product updates merge supplied presentation fields with existing presentation.
Omitted fields survive; an empty string clears an image role and `gallery: []`
clears the gallery. JSON omits `undefined` values, so they preserve existing
fields rather than clearing them. `null` is rejected for `productType`,
`presentation`, individual image roles and `gallery`; use explicit role clearing.
An empty presentation object preserves all existing roles. Historical null media
is safe to read and is not assigned to a different role.
New or changed URLs must use HTTP(S) without embedded credentials. Unchanged
historical values are preserved on unrelated updates.

There is no backfill, bulk update, publication or automatic media migration.
Before using the new Admin fields against a running API, ensure it is running
this schema version; an older Mongoose schema can discard unknown fields.
Reloading/restarting the API must follow the environment's normal safe procedure,
including accounting for the Discord worker started by its server entry point.

For catalogue creation, supply the explicit type and correctly assigned media,
and set pricing, status and visibility intentionally. Type selection makes no
assumption about price, free access or publication.

The current commerce pricing contract requires `pricing` for drafts as well as
published products: either confirmed `free` with zero cents or `one_time` with a
positive integer cent amount, with currency `USD`. It has no unknown-price state.
If a price is undecided, keep the proposed Commerce Product as an unsaved/local
draft until pricing is decided; do not substitute free or a nominal amount.
When the price is confirmed and creation is authorized, explicitly use
`status: 'draft'` and `visibility: 'private'` to keep the product unpublished.
Fulfillment grants must still satisfy existing validation; free products require
at least one grant. Supporting unknown-price saved drafts would be a separate
pricing-workflow change.
