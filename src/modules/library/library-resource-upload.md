# Library Resource Upload Process

## Storage Decision

Use Cloudinary as the live delivery provider for library resources right now.

Why:

- The API already uploads files to Cloudinary through `POST /api/v1/upload/cloudinary/file`.
- The library consume flow already knows how to resolve a Cloudinary `public_id` from `Resource.currentRelease.assetKey`.
- Cloudinary returns stable provider metadata needed by the library model: `publicId`, `resourceType`, `format`, `bytes`, and delivery URL.
- Google Drive is fine as an authoring/archive location, but the current API does not have a Google Drive provider implementation for upload, lookup, or entitlement-gated streaming.

In the current system, Google Drive should be treated as the source/archive copy and Cloudinary as the API delivery location.

## Start The API

Run the API locally with the normal environment configured:

```powershell
npm run dev
```

The upload endpoint is mounted at:

```text
POST http://localhost:5000/api/v1/upload/cloudinary/file
```

## Postman Upload Request

1. Create a new `POST` request.
2. Set the URL:

```text
http://localhost:5000/api/v1/upload/cloudinary/file
```

3. In `Authorization`, use a valid bearer token:

```text
Bearer <your-jwt>
```

4. In `Body`, choose `form-data`.
5. Add a file field:

```text
Key: document
Type: File
Value: choose a PDF, such as Tapestry_Quickstart_Guide.pdf
```

6. Add the matching type field:

```text
Key: type
Type: Text
Value: pdf
```

For multiple files, use paired fields:

```text
document      File  Rules And Rulings Guide.pdf
type          Text  pdf
document2     File  Tapestry Players Guide V1.pdf
type2         Text  pdf
```

The upload service maps each file key to a type key by replacing `document` with `type`.

## Expected Upload Response

The response should look like:

```json
{
  "payload": [
    {
      "provider": "cloudinary",
      "assetKey": "users/example/uploads/Tapestry_Quickstart_Guide",
      "publicId": "users/example/uploads/Tapestry_Quickstart_Guide",
      "url": "https://res.cloudinary.com/.../Tapestry_Quickstart_Guide.pdf",
      "fileName": "Tapestry_Quickstart_Guide.pdf",
      "type": "pdf",
      "mimeType": "application/pdf",
      "resourceType": "raw",
      "format": "pdf",
      "bytes": 16988
    }
  ]
}
```

Use `assetKey` as the value for `Resource.currentRelease.assetKey`.

## Create The Library Resource

After upload, create the library resource with an admin token:

```text
POST http://localhost:5000/api/v1/library/resources
```

Headers:

```text
Authorization: Bearer <admin-jwt>
X-Service-Name: admin
Content-Type: application/json
```

Example body:

```json
{
  "key": "tapestry-quickstart-guide",
  "slug": "tapestry-quickstart-guide",
  "title": "Tapestry Quickstart Guide",
  "summary": "Quickstart rules for Tapestry.",
  "kind": "quickstart",
  "format": "pdf",
  "status": "published",
  "accessPolicy": "entitlement",
  "currentRelease": {
    "version": "1.0",
    "provider": "cloudinary",
    "assetKey": "users/example/uploads/Tapestry_Quickstart_Guide",
    "mimeType": "application/pdf",
    "sizeBytes": 16988,
    "publishedAt": "2026-06-12T00:00:00.000Z"
  },
  "tags": ["quickstart", "rules"],
  "authors": ["Tapestry"]
}
```

## Verify In Logs

During upload, the API now logs:

- request arrival and file field names
- parsed file name, MIME type, logical type, and byte size
- Cloudinary upload start
- Cloudinary upload success with `publicId`, resource type, format, and byte size
- final uploaded count and public IDs

The logs intentionally do not print tokens, API keys, or Cloudinary secrets.

## Verify Consumption Later

Once commerce grants the resource entitlement to a player, the frontend should call:

```text
GET http://localhost:5000/api/v1/library/resources/mine
```

That response includes `consumeUrl`. Use that URL to view the resource through the API stream instead of linking directly to Cloudinary.
