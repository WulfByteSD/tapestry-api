# 🔔 Notification Module Documentation

The `notification` module handles in-app notifications and browser push notifications for Tapestry users.

## 📁 Module Structure

```
modules/notification
├── handler/    # Business logic for notification operations
├── model/      # Mongoose schema for notification documents
├── route/      # Express routes mounted at /api/v1/notification
│   ├── index.ts    # In-app notification routes
│   └── push.ts     # Web Push subscription routes
├── email/      # Email notification utilities
└── services/   # Service layer (NCRUDService, PushSubscriptionService)
```

---

## 🚦 Routes

### In-App Notifications — `/api/v1/notification`

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `GET` | `/health` | No | — | Service health check |
| `GET` | `/` | Yes | Any | List notifications for the authenticated user |
| `POST` | `/` | Yes | Any | Create a notification |
| `POST` | `/:id` | Yes | Any | Mark a notification as read/updated |
| `POST` | `/update/all` | Yes | Any | Mark all notifications as read |
| `DELETE` | `/:id` | Yes | `admin`, `developer` | Delete a notification |
| `POST` | `/alert` | Yes | `admin`, `developer` | Broadcast an alert notification to users |

### Push Subscriptions — `/api/v1/notification/subscriptions`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | Yes | List push subscriptions for the authenticated user |
| `POST` | `/` | Yes | Register or update a push subscription |
| `DELETE` | `/` | Yes | Remove the authenticated user's push subscription |
| `POST` | `/test` | Yes | Send a test push notification to the authenticated user |

---

## 🧪 Testing the Endpoints

```http
GET  /api/v1/notification/health
GET  /api/v1/notification
POST /api/v1/notification/subscriptions/test
```

Authentication follows the same bearer token pattern as other modules.

---

## 📌 Notes

- In-app notifications are stored in MongoDB and retrieved per user.
- Web Push requires VAPID keys configured in your `.env` file (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`).
- The alert endpoint (`POST /alert`) is restricted to admin and developer roles and is used for broadcasting system-wide messages.
