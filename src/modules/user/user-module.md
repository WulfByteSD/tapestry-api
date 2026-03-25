# 👥 User Module Documentation

The `user` module manages Tapestry user accounts. It provides admin and privileged-role access to user records, including listing, updating, and deleting users.

## 📁 Module Structure

```
modules/user
├── handler/    # Business logic for user operations
├── route/      # Express routes mounted at /api/v1/user
│   └── index.ts
└── service/    # UserService
```

---

## 🚦 Routes

### User Management — `/api/v1/user`

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `GET` | `/health` | No | — | Service health check |
| `GET` | `/:id` | Yes | Any | Get a user by ID |
| `PUT` | `/:id` | Yes | Any | Update a user's own account |
| `GET` | `/` | Yes | `*`, `admin`, `moderator`, `developer`, `support` | List all users |
| `POST` | `/` | Yes | `*`, `admin`, `moderator`, `developer`, `support` | Create a new user |
| `POST` | `/:id/reset-password` | Yes | `*`, `admin`, `moderator`, `developer`, `support` | Reset a user's password |
| `DELETE` | `/:id` | Yes | `users.delete`, `developer` | Permanently delete a user |

---

## 🧪 Testing the Endpoints

```http
GET /api/v1/user/health
GET /api/v1/user/:id
PUT /api/v1/user/:id
```

---

## 📌 Notes

- Standard authenticated users can only read and update their own records (`GET /:id`, `PUT /:id`).
- Listing users, creating users, and resetting passwords requires elevated roles (`admin`, `moderator`, `developer`, or `support`).
- User deletion is tightly controlled and requires the `users.delete` permission or `developer` role.
- For self-service password changes, see the auth module's forgot/reset password flow in [src/modules/auth/docs/password-recovery.md](../auth/docs/password-recovery.md).
