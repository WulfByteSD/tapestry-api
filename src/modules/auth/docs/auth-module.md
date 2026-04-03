# 🛡️ Auth Module Documentation

The `auth` module handles user authentication workflows for the Free Agent Portal. This includes registration, login, password recovery, token management, and more.

## 📁 Module Overview

This module follows the [Modular Monolith design](../../README.md#api-design) defined in the API Architecture Strategy. It is isolated under its own domain:

/modules
/auth
/handlers # Business logic encapsulation
/services # Orchestration & validation
/routes # API route bindings
/models # (optional) Auth-specific types or payloads
AuthService.ts # Entry point for orchestration logic

markdown
Copy
Edit

## 🔗 Related Documents

- [User Registration Workflow](./registration-workflow.md)
- [Password Recovery Flow](./password-recovery.md)
  |

## 🔒 Authentication Design Philosophy

- **Centralized User Model**: All roles (athlete, agent, scout, etc.) connect to a shared `User` record.
- **Separation of Concerns**: Profile creation and auth logic are strictly decoupled.
- **Token-first Architecture**: JWTs contain roles and profile references to eliminate unnecessary DB hits.
- **Module Cohesion**: All Auth document operations (public auth flows + admin management) are co-located in this module.
- **Extraction-Ready**: Public auth routes can be extracted to a separate service when needed; admin operations stay with main API.

## 🔄 Auth Workflows

Each major auth function has a dedicated handler:

- `RegisterHandler.execute()` → Create user + profile
- `AuthenticationHandler.()*` → Validate logins, Tokens, return JWT
- `PasswordRecoveryHandler.requestReset()` → Attach reset token to user
- `PasswordRecoveryHandler.resetPassword()` → Validate and update password

## 🔧 Admin Operations

The auth module also contains admin-only operations for managing user accounts:

### AdminAuthHandler & AdminAuthService

These components handle administrative CRUD operations on Auth documents:

- **User Account CRUD**: Create, read, update, and delete user accounts
- **Forced Password Reset**: Admins can force password changes with optional notifications
- **Profile Cleanup**: Automatically cleans up related profiles when a user is deleted
- **Secure Password Generation**: Generate secure random passwords for new users

### Admin Endpoints

All admin endpoints are under `/api/v1/auth/users/*` and require admin permissions:

- `POST /api/v1/auth/users` → Create new user account (admin/moderator/developer/support)
- `GET /api/v1/auth/users` → List all user accounts with filtering (admin/moderator/developer/support)
- `GET /api/v1/auth/users/:id` → Get specific user account (authenticated)
- `PUT /api/v1/auth/users/:id` → Update user account (authenticated)
- `POST /api/v1/auth/users/:id/reset-password` → Force password reset (admin/moderator/developer/support)
- `DELETE /api/v1/auth/users/:id` → Delete user account (users.delete permission or developer only)

### Password Reset: Self-Service vs Admin-Forced

**Self-Service Reset** (via `PasswordRecoveryHandler`):

- User requests password reset via email
- Token-based workflow with `POST /api/v1/auth/forgot-password`
- User completes reset with `PUT /api/v1/auth/reset-password/:token`

**Admin-Forced Reset** (via `AdminAuthHandler`):

- Admin directly sets new password without token
- Optional notification sent to user via event bus
- Can auto-generate secure password with `generateSecure: true`
- Used for account recovery, security incidents, or initial setup

### Profile Cleanup on Deletion

When an admin deletes a user account, the `AdminAuthHandler.afterDelete()` hook:

1. Iterates through all `profileRefs` in the deleted user document
2. Removes `userId` references from associated profiles
3. For team profiles, removes user from `linkedUsers` array
4. Preserves profile data while severing the connection to deleted user

## 🧪 Testing

Use tools like Postman to test key endpoints:

### Public Auth Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### Admin Endpoints (requires admin authorization)

- `GET /api/v1/auth/users` → List users
- `POST /api/v1/auth/users` → Create user
- `PUT /api/v1/auth/users/:id` → Update user
- `POST /api/v1/auth/users/:id/reset-password` → Force password reset
- `DELETE /api/v1/auth/users/:id` → Delete user

To set the `Authorization` header with an API Key:

```http
Authorization: ApiKey <your-api-key>
```

OR

```http
Authorization: Bearer <JWT Token>
```

## 📌 Notes

All handlers are pure where possible and testable in isolation.

Email delivery is triggered in AuthService, not within handlers (in line with SRP).

Token TTLs and hashing strategies are configurable via environment variables.
