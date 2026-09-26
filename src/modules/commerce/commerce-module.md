# Commerce Module

## Purpose

The `commerce` module owns the product catalog and acquisition flows for Tapestry.

It exists to expose claimable or purchasable products such as:

- Player's Guide
- Story modules
- Tone dials
- Digital resources
- Future physical products

## What Commerce Owns

- Product metadata
- Product pricing
- Product visibility
- Product fulfillment and grant targets
- Product acquisition logic

## What Commerce Does Not Own

Commerce does not own resources or resource access.

Commerce must not store:

- PDF URLs
- Resource file metadata
- Resource release/version details
- Duplicated user resource ownership records

## Relationship With Library Resources

This repo's current resource boundary lives in `src/modules/library`.

- `Resource` owns the actual resource metadata and releases
- `RAG` owns resource access grants
- `commerce` only defines products and acquisition flows

When acquisition grants access to a resource, commerce delegates to the library module.

## Product Model Summary

`Product` stores:

- stable `key` and `slug`
- presentation content
- `status` and `visibility`
- integer-cent USD pricing
- fulfillment kind
- resource grant targets
- tags
- audit fields for `createdBy` and `updatedBy`

It does not duplicate resource titles, slugs, URLs, file metadata, or release metadata.

## Free Claim Flow

1. Authenticated user claims a published free product.
2. Commerce validates that the product is claimable and has resource grants.
3. Commerce delegates each grant to the library module's entitlement grant helper.
4. Library resolves the player profile and creates or extends `RAG` access idempotently.
5. Commerce returns a per-grant acquisition result.

## Routes

- `GET /api/v1/commerce/health`
- `GET /api/v1/commerce/products`
- `GET /api/v1/commerce/products/slug/:slug`
- `GET /api/v1/commerce/products/:id`
- `POST /api/v1/commerce/products/:productId/claim`
- `GET /api/v1/commerce/admin/products`
- `GET /api/v1/commerce/admin/products/:id`
- `POST /api/v1/commerce/admin/products`
- `PUT /api/v1/commerce/admin/products/:id`
- `DELETE /api/v1/commerce/admin/products/:id`

## Seed Notes

No existing seeded Player's Guide resource was found in this repo.

TODO:

- When the resource exists in library seed data, add a commerce product seed using:
  - resource key: `tapestry-players-guide`
  - product key: `tapestry-players-guide-digital`
  - product slug: `tapestry-players-guide`

## Future Expansion

This module intentionally leaves room for:

- paid checkout
- receipts and orders
- bundles
- subscriptions
- physical fulfillment
- shipping and inventory

Those are out of scope for this MVP.
