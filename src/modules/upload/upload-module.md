# 📁 Upload Module Documentation

The `upload` module handles file and image uploads for Tapestry users. It currently integrates with **Cloudinary** for cloud-based asset storage.

## 📁 Module Structure

```
modules/upload
├── handlers/    # Upload business logic
├── routes/      # Express routes mounted at /api/v1/upload
│   ├── index.ts        # Upload router aggregator
│   └── cloudinary.ts   # Cloudinary-specific upload route
└── services/    # CloudinaryService
```

---

## 🚦 Routes

### Upload Router — `/api/v1/upload`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Service health check |

### Cloudinary Uploads — `/api/v1/upload/cloudinary`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/file` | Yes | Upload a file or image to Cloudinary |

---

## 🧪 Testing the Endpoints

```http
GET  /api/v1/upload/health
POST /api/v1/upload/cloudinary/file
```

The file upload endpoint requires a valid bearer token. Send files as `multipart/form-data`.

---

## 📌 Notes

- Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) must be configured in your `.env` file.
- Uploaded assets are stored in Cloudinary and the returned URL is used to reference the file in the database.
- Only authenticated users can upload files.
