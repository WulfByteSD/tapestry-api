# Tapestry API

The backend API powering the Tapestry TTRPG ecosystem. Built with Node.js, Express, TypeScript, and MongoDB, it serves the player-facing application, Storyweaver admin tools, and all shared game content and rules.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [Building for Production](#building-for-production)
- [Testing](#testing)
- [Database Seeding](#database-seeding)
- [API Routes](#api-routes)
- [Project Structure](#project-structure)

---

## Overview

Tapestry API is the single source of truth for:

- Player character and campaign management
- Storyweaver / admin tooling
- Shared game content (abilities, skills, policies, and more)
- Authentication, billing, notifications, and file uploads

All routes are versioned under `/api/v1`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Express |
| Database | MongoDB (via Mongoose) |
| Auth | JWT + bcrypt |
| Real-time | Socket.IO |
| File Storage | Cloudinary |
| Email | SendGrid / Nodemailer |
| Payments | Stripe |
| Push Notifications | Web Push |

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- **MongoDB** — either a local instance or a MongoDB Atlas cluster

---

## Installation

```bash
# Clone the repository
git clone https://github.com/WulfByteSD/tapestry-api.git
cd tapestry-api

# Install dependencies
npm install
```

---

## Environment Variables

Create a `.env` file in the project root. The following variables are used by the application:

```dotenv
# Server
NODE_ENV=development          # development | production
PORT=5000
CORE_CAP=2                    # Maximum number of cluster worker processes

# MongoDB
MONGO_USER=your_mongo_user
MONGO_PASS=your_mongo_password
CLUSTER_STRING=your_atlas_cluster_string   # e.g. cluster0.xxxxx.mongodb.net
MONGO_DBNAME=tapestry-api

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=30d
JWT_COOKIE_EXPIRE=30

# Cloudinary (file uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# SendGrid (email)
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=no-reply@yourdomain.com
FROM_NAME=Tapestry

# Stripe (payments)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Web Push (notifications)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=mailto:admin@yourdomain.com

# reCAPTCHA
RECAPTCHA_SECRET=your_recaptcha_secret
```

> **Note:** If `MONGO_USER`, `MONGO_PASS`, and `CLUSTER_STRING` are not set, the server will fall back to a local MongoDB instance at `mongodb://localhost:27017/tapestry-api`.

---

## Running the Server

### Development

Uses `ts-node-dev` for hot-reloading TypeScript changes:

```bash
npm run dev
```

### Production

Build the project first, then start the compiled output:

```bash
npm run build
npm start
```

The server defaults to port **5000** and can be changed via the `PORT` environment variable.

---

## Building for Production

```bash
npm run build
```

Compiled JavaScript is output to the `./dist` directory. The entry point is `dist/server.js`.

---

## Testing

Run the full test suite:

```bash
npm test
```

Run tests in watch mode during development:

```bash
npm run test:watch
```

Tests use **Jest** with **ts-jest** for TypeScript support.

---

## Database Seeding

Several seed scripts are available to populate game content:

```bash
# Seed all core game content
npm run seed:game-content

# Seed abilities only
npm run seed:abilities

# Seed skills only
npm run seed:skills

# Seed policies only
npm run seed:policies
```

> Seeding scripts connect directly to the database using environment variables from your `.env` file. Ensure the database is reachable before running them.

---

## API Routes

All routes are prefixed with `/api/v1`.

| Prefix | Description |
|---|---|
| `/api/v1/auth` | Registration, login, password reset, email verification, plans, billing, and legal |
| `/api/v1/user` | User account management |
| `/api/v1/profiles` | Player profiles |
| `/api/v1/game/characters` | Character creation and management |
| `/api/v1/game/campaigns` | Campaign management |
| `/api/v1/game/rolls` | Dice roll resolution |
| `/api/v1/game/content` | Shared game content (abilities, skills, etc.) |
| `/api/v1/game/storyweaver` | Storyweaver / admin game tools |
| `/api/v1/notification` | In-app and push notifications |
| `/api/v1/upload` | File and image uploads |
| `/api/v1/payment` | Payment processing |
| `/api/v1/support` | Support requests |
| `/api/v1/admin` | Administrative profile tools |

A health check is available at `/api/v1/` — it returns `200` with `{ "message": "API V1 is working" }`.

---

## Project Structure

```
tapestry-api/
├── src/
│   ├── config/         # Database connection
│   ├── cron/           # Scheduled jobs
│   ├── lib/            # Shared libraries
│   ├── middleware/      # Auth, error handling, async wrapper
│   ├── modules/         # Feature modules (auth, game, user, etc.)
│   │   ├── auth/
│   │   ├── game/
│   │   │   ├── campaigns/
│   │   │   ├── characters/
│   │   │   ├── content/
│   │   │   ├── rules/
│   │   │   └── storyweaver/
│   │   ├── notification/
│   │   ├── payment/
│   │   ├── profiles/
│   │   ├── support/
│   │   ├── upload/
│   │   └── user/
│   ├── route/
│   │   └── v1/          # Versioned route aggregator
│   ├── scripts/         # Seed and dev utility scripts
│   ├── socket/          # Socket.IO connection handling
│   ├── types/           # Shared TypeScript types
│   ├── utils/           # General utilities
│   └── server.ts        # Application entry point
├── public/              # Static files served by Express
├── dist/                # Compiled output (generated by `npm run build`)
├── jest.config.js
├── tsconfig.json
├── package.json
└── .env                 # Local environment variables (not committed)
```
