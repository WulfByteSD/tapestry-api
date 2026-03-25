# 👤 Profiles Module Documentation

The `profiles` module manages player and admin profile records. Profiles are created automatically during registration and hold game-facing identity information separate from the core `User` auth record.

## 📁 Module Structure

```
modules/profiles
├── admin/       # Admin profile handlers, model, routes, and service
│   ├── handlers/
│   ├── model/
│   ├── route/
│   └── service/
├── player/      # Player profile handlers, model, routes, and service
│   ├── handlers/
│   ├── model/
│   ├── route/
│   └── service/
└── routes/      # Central profile router
    └── index.ts # Mounts /admin and /player sub-routers
```

All profile routes are mounted under `/api/v1/profiles`.

---

## 🚦 Routes

### Admin Profiles — `/api/v1/profiles/admin`

Admin profile routes require authentication and admin-level permissions.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Service health check |
| `GET` | `/` | Yes (admin) | List all admin profiles |
| `POST` | `/` | Yes (admin) | Create a new admin profile |
| `GET` | `/:id` | Yes (admin) | Get an admin profile by ID |
| `PUT` | `/:id` | Yes (admin) | Update an admin profile |
| `DELETE` | `/:id` | Yes (admin) | Delete an admin profile |
| `GET` | `/profile/:id` | Yes (admin) | Get an admin profile by user ID |

### Player Profiles — `/api/v1/profiles/player`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Service health check |
| `GET` | `/storyweavers` | No | List all Storyweaver profiles (public, for LFG/matchmaking) |
| `GET` | `/` | Yes | List player profiles |
| `POST` | `/` | Yes | Create a player profile |
| `GET` | `/:id` | Yes | Get a player profile by ID |
| `PUT` | `/:id` | Yes | Update a player profile |
| `DELETE` | `/:id` | Yes | Delete a player profile |
| `PATCH` | `/:id/promote-storyweaver` | Yes | Promote a player profile to Storyweaver |
| `GET` | `/profile/:id` | Yes | Get a player profile by user reference |

---

## 🧪 Testing the Endpoints

```http
GET /api/v1/profiles/health
GET /api/v1/profiles/player/storyweavers
GET /api/v1/profiles/player/:id
```

---

## 📌 Notes

- Profile creation is handled automatically by the `RegisterHandler` during auth registration — do not call these routes directly during user signup.
- The `GET /storyweavers` endpoint is **public** and does not require authentication. It supports `page` and `limit` query parameters for pagination.
- Admin profiles are protected by role-based access control using `RolesConfig.getDefaultPermissionsForRole('admin')`.
- The `promote-storyweaver` endpoint sets the Storyweaver flag on the player's profile and is also accessible via `POST /api/v1/game/storyweaver/become`.
