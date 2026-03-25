# 🎮 Game Module Documentation

The `game` module is the core of the Tapestry TTRPG system. It contains all gameplay mechanics, including character and campaign management, dice rolls, shared content, Storyweaver tools, and the game rules engine.

## 📁 Module Structure

```
modules/game
├── campaigns/       # Campaign creation and member management
├── characters/      # Character creation, updates, and rules application
│   └── (rolls)      # Dice roll resolution lives alongside characters
├── content/         # Shared game content (abilities, skills, items, lore, settings)
├── rules/           # Pure TypeScript rule engine (no HTTP routes)
├── storyweaver/     # Storyweaver role and tooling
├── routes/          # Top-level game route aggregator
├── schemas/         # Shared Mongoose schemas
└── utils/           # Game-level utilities
```

All game routes are mounted under `/api/v1/game`.

---

## 📖 Sub-Modules

### Campaigns

Manages tabletop campaigns where a Storyweaver hosts sessions and players bring characters.

**Routes** — `/api/v1/game/campaigns` (all routes require authentication)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List campaigns for the authenticated user |
| `POST` | `/` | Create a new campaign |
| `GET` | `/:id` | Get a single campaign |
| `PUT` | `/:id` | Update a campaign |
| `DELETE` | `/:id` | Delete a campaign |
| `POST` | `/:id/members` | Add a member to a campaign |
| `DELETE` | `/:id/members/:playerId` | Remove a member from a campaign |
| `GET` | `/health` | Service health check |

---

### Characters

Handles the full lifecycle of player characters, including creation, updates, campaign enrollment, and harm application. All mutations pass through the game rules engine automatically.

**Routes** — `/api/v1/game/characters` (all routes require authentication)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List characters for the authenticated user |
| `POST` | `/` | Create a new character |
| `GET` | `/:id` | Get a single character |
| `PUT` | `/:id` | Update a character (rules applied automatically) |
| `DELETE` | `/:id` | Delete a character |
| `POST` | `/:id/join-campaign` | Join a campaign with this character |
| `POST` | `/:id/leave-campaign` | Leave the current campaign |
| `POST` | `/:id/apply-harm` | Apply harm to a character |
| `POST` | `/:id/fork` | Fork (copy) a character |
| `GET` | `/health` | Service health check |

---

### Dice Rolls

Resolves dice rolls according to Tapestry game rules and records roll history per character or campaign.

**Routes** — `/api/v1/game/rolls` (all routes require authentication)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/` | Resolve a new dice roll |
| `GET` | `/` | Retrieve roll history (supports filtering and pagination) |
| `GET` | `/health` | Service health check |

**Roll Modes**

The roll endpoint supports three modes:

1. **Edge Roll** — 4d6, keep the best 3 (Tapestry advantage mechanic)
   ```json
   { "edge": true, "faces": 6, "characterId": "...", "rollType": "attack" }
   ```

2. **Burden Roll** — 4d6, keep the worst 3 (Tapestry disadvantage mechanic)
   ```json
   { "burden": true, "faces": 6, "characterId": "..." }
   ```

3. **Custom Roll** — Any dice count, faces, and keep configuration
   ```json
   { "diceCount": 5, "faces": 6, "keepBest": 4, "operations": [{ "operator": "+", "value": 2 }] }
   ```

**Roll History Query Parameters**

| Param | Description |
|-------|-------------|
| `filterOptions` | `character;{id}`, `campaign;{id}`, or `rollType;{type}` |
| `keyword` | Search in expression, context, `aspectUsed`, or `rollType` |
| `sortOptions` | Default: `-rolledAt` |
| `pageNumber` | Page number (default: 1) |
| `pageLimit` | Results per page (default: 10) |

---

### Content

Provides read/write access to shared game content definitions. These are the building blocks that Storyweavers and players reference during play.

**Routes** — `/api/v1/game/content` (all routes require authentication)

#### Abilities — `/api/v1/game/content/abilities`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all abilities |
| `GET` | `/:id` | Get an ability by ID |
| `GET` | `/by-key/:key` | Get an ability by its unique key |
| `GET` | `/setting/:settingKey` | List abilities for a specific setting |
| `POST` | `/` | Create a new ability definition |
| `PUT` | `/:id` | Update an ability definition |
| `DELETE` | `/:id` | Delete an ability definition |

#### Skills — `/api/v1/game/content/skills`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all skills |
| `GET` | `/:id` | Get a skill by ID |
| `GET` | `/by-key/:key` | Get a skill by its unique key |
| `GET` | `/setting/:settingKey` | List skills for a specific setting |
| `POST` | `/` | Create a new skill definition |
| `PUT` | `/:id` | Update a skill definition |
| `DELETE` | `/:id` | Delete a skill definition |

#### Items — `/api/v1/game/content/items`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all items |
| `GET` | `/:id` | Get an item by ID |
| `GET` | `/by-key/:key` | Get an item by its unique key |
| `GET` | `/setting/:settingKey` | List items for a specific setting |
| `POST` | `/` | Create a new item definition |
| `PUT` | `/:id` | Update an item definition |
| `DELETE` | `/:id` | Delete an item definition |

#### Lore — `/api/v1/game/content/lore`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all lore entries |
| `GET` | `/:id` | Get a lore entry by ID |
| `GET` | `/tree/:settingKey` | Get the full lore tree for a setting |
| `GET` | `/children/:parentId` | Get child lore nodes |
| `GET` | `/by-key/:settingKey/:key` | Get a lore entry by setting and key |
| `POST` | `/` | Create a new lore entry |
| `PUT` | `/:id` | Update a lore entry |
| `DELETE` | `/:id` | Delete a lore entry |

#### Settings — `/api/v1/game/content/settings`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all game settings |
| `GET` | `/:id` | Get a setting by ID |
| `GET` | `/by-key/:key` | Get a setting by its unique key |
| `POST` | `/` | Create a new setting |
| `PUT` | `/:id` | Update a setting |
| `DELETE` | `/:id` | Delete a setting |

---

### Storyweaver

Provides tools for players to become Storyweavers (game masters) and access storyweaver-specific functionality.

**Routes** — `/api/v1/game/storyweaver` (all routes require authentication)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/become` | Transition the authenticated user to the Storyweaver role |

---

### Rules Engine

The `rules` sub-module is a **pure TypeScript library** with no HTTP routes. It is called internally by the character service to enforce Tapestry game rules whenever a character is created or updated.

**Enforced Rules**

| Rule | Logic |
|------|-------|
| Aspect Range Validation | All sub-aspects must be within **-2 to +4**; throws on violation |
| Max HP Calculation | `maxHP = 12 + Might [Strength]` |
| Current HP Clamping | `currentHP` is clamped to `maxHP` if it would exceed it |
| Threads Range | All thread values (`current`, `max`, `temp`) are clamped to **0–5** |
| Attack Outcome | `miss` ≤ TN−3 · `weak_hit` TN−2 to TN−1 · `hit` TN to TN+2 · `strong_hit` ≥ TN+3 |

**Aspect Families**

| Family | Sub-Aspects |
|--------|-------------|
| Might | `strength`, `presence` |
| Finesse | `agility`, `charm` |
| Wit | `instinct`, `knowledge` |
| Resolve | `willpower`, `empathy` |

**Usage (internal)**

```typescript
import { applyCharacterRules } from '../rules';

const validated = applyCharacterRules(characterData);
```

---

## 🧪 Testing

Health check endpoints are available on each sub-module:

```http
GET /api/v1/game/campaigns/health
GET /api/v1/game/characters/health
GET /api/v1/game/rolls/health
GET /api/v1/game/content/health
```

The rules engine has its own unit tests located in `src/modules/game/rules/__tests__/`.

---

## 📌 Notes

- All game routes (except health checks) require a valid bearer token.
- Character mutations (create, update, apply-harm) automatically pass data through the rules engine before persisting.
- Content definitions (abilities, skills, items, lore, settings) are setting-scoped — use the `settingKey` parameter to filter by game world.
- The attack outcome thresholds in the rules engine are subject to change as Tapestry combat is finalized.
