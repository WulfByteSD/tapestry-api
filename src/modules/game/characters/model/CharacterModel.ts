import mongoose from 'mongoose';

export type SheetStatus = 'active' | 'archived';

/**
 * Canonical aspects per the Player’s Guide:
 * Might[Strength], Might[Presence]
 * Finesse[Agility], Finesse[Charm]
 * Wit[Instinct], Wit[Knowledge]
 * Resolve[Willpower], Resolve[Empathy]
 */
export interface AspectBlock {
  strength: number;
  presence: number;
  agility: number;
  charm: number;
  instinct: number;
  knowledge: number;
  willpower: number;
  empathy: number;
}

export interface ResourceTrack {
  current: number;
  max: number;
  temp?: number;
}

export interface ConditionInstance {
  key: string; // e.g. "poisoned", "exposed"
  stacks?: number; // optional
  appliedAt?: Date; // optional (defaults to now)
  expiresAt?: Date | null; // optional
  source?: string; // optional narrative reference / source key
  notes?: string;
}

export interface AttackProfile {
  key: string;
  name: string;
  attackKind?: 'melee' | 'ranged' | 'spell' | 'special';
  defaultAspect?: string;
  allowedSkillKeys?: string[];
  modifier?: number;
  harm?: number | string;
  rangeLabel?: string;
  tags?: string[];
  notes?: string;
}

export interface InventoryItem {
  instanceId?: string;

  // canonical content link
  definition?: {
    itemKey: string;
    sourceId?: string;
    settingKey?: string;
    version?: number;
  };

  // transitional / legacy
  itemKey?: string;
  sourceId?: string;

  name?: string;

  qty: number;
  tags?: string[];
  notes?: string;

  category?:
    | 'weapon'
    | 'armor'
    | 'gear'
    | 'consumable'
    | 'tool'
    | 'currency'
    | 'quest'
    | 'other';

  equipped?: boolean;
  slot?: string;

  attackProfiles?: AttackProfile[];
  selectedAttackProfileKey?: string;

  overrides?: {
    displayName?: string;
    modifier?: number;
    harm?: number | string;
    tags?: string[];
  };
}
export interface CharacterType extends mongoose.Document {
  player: mongoose.Schema.Types.ObjectId; // ref Player (profile)
  campaign: mongoose.Schema.Types.ObjectId | null; // ref to active Campaign (optional)
  name: string;
  avatarUrl?: string | null;
  forkedFrom?: mongoose.Schema.Types.ObjectId; // optional reference to original sheet if this is a forked copy
  status: SheetStatus;
  tags: string[];

  // Optional campaign / setting context (not required for MVP)
  settingKey?: string; // e.g. "woven-realms"
  toneModules: string[]; // e.g. ["dragon-dial"]
  rulesetVersion: number; // bump if you change sheet structure

  sheet: {
    // Optional: “archetype/class” key from content library later
    archetypeKey?: string; // e.g. "warden"

    // Weave milestone / level-ish number (defaults 1)
    weaveLevel: number;

    // Fixed aspects (canonical keys)
    aspects: {
      might: {
        strength: number;
        presence: number;
      };
      finesse: {
        agility: number;
        charm: number;
      };
      wit: {
        instinct: number;
        knowledge: number;
      };
      resolve: {
        willpower: number;
        empathy: number;
      };
      // Rare escape hatch for future modules that add extra sub-aspects:
      extra?: Record<string, number>; // stored as Map in Mongo
    };

    // Dynamic values (setting/tone dependent)
    skills: Record<string, number>; // stored as Map in Mongo

    // Features/knacks: store keys (official or homebrew). If you truly need freeform,
    // generate a hb:* key on the fly and treat it as “homebrew definition pending”.
    features: string[];

    resources: {
      hp: ResourceTrack;
      threads: ResourceTrack;
      // optional future pools (only use if/when your rules need them)
      resolve?: ResourceTrack;
      other: Record<string, number>; // stored as Map in Mongo
    };

    conditions: ConditionInstance[];
    inventory: InventoryItem[];

    notes?: string;
  };

  meta: {
    lastPlayedAt?: Date | null;
    deletedAt?: Date | null; // soft delete (optional)
  };

  createdAt: Date;
  updatedAt: Date;
}

// ----- sub-schemas -----

const ResourceTrackSchema = new mongoose.Schema(
  {
    current: { type: Number, default: 0, min: 0 },
    max: { type: Number, default: 0, min: 0 },
    temp: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const ConditionInstanceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    stacks: { type: Number, default: 1 },
    appliedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, default: null },
    source: { type: String, trim: true },
    notes: { type: String },
  },
  { _id: false }
);

const AttackProfileSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    attackKind: {
      type: String,
      enum: ['melee', 'ranged', 'spell', 'special'],
      default: 'melee',
    },
    defaultAspect: { type: String, trim: true, default: null },
    allowedSkillKeys: { type: [String], default: [] },
    modifier: { type: Number, default: 0 },
    harm: { type: mongoose.Schema.Types.Mixed, default: null },
    rangeLabel: { type: String, trim: true, default: null },
    tags: { type: [String], default: [] },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const InventoryDefinitionRefSchema = new mongoose.Schema(
  {
    itemKey: { type: String, trim: true, required: true },
    sourceId: { type: String, trim: true, default: null },
    settingKey: { type: String, trim: true, default: null },
    version: { type: Number, default: 1 },
  },
  { _id: false }
);

const InventoryOverridesSchema = new mongoose.Schema(
  {
    displayName: { type: String, trim: true, default: null },
    modifier: { type: Number, default: null },
    harm: { type: mongoose.Schema.Types.Mixed, default: null },
    tags: { type: [String], default: [] },
  },
  { _id: false }
);

const InventoryItemSchema = new mongoose.Schema(
  {
    instanceId: { type: String, trim: true },

    definition: { type: InventoryDefinitionRefSchema, default: null },

    itemKey: { type: String, trim: true },
    sourceId: { type: String, trim: true },

    name: { type: String, trim: true },

    qty: { type: Number, default: 1, min: 0 },
    tags: { type: [String], default: [] },
    notes: { type: String, default: '' },

    category: {
      type: String,
      enum: ['weapon', 'armor', 'gear', 'consumable', 'tool', 'currency', 'quest', 'other'],
      default: 'other',
    },
    equipped: { type: Boolean, default: false },
    slot: { type: String, trim: true, default: null },

    attackProfiles: { type: [AttackProfileSchema], default: [] },
    selectedAttackProfileKey: { type: String, trim: true, default: null },

    overrides: { type: InventoryOverridesSchema, default: null },
  },
  { _id: false }
);

// ----- main schema -----

const CharacterSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: null },
    forkedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', default: null },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    tags: { type: [String], default: [] },

    settingKey: { type: String, trim: true },
    toneModules: { type: [String], default: [] },
    rulesetVersion: { type: Number, default: 1 },

    sheet: {
      archetypeKey: { type: String, trim: true },
      weaveLevel: { type: Number, default: 1, min: 1 },

      aspects: {
        might: {
          strength: { type: Number, default: 0 },
          presence: { type: Number, default: 0 },
        },
        finesse: {
          agility: { type: Number, default: 0 },
          charm: { type: Number, default: 0 },
        },
        wit: {
          instinct: { type: Number, default: 0 },
          knowledge: { type: Number, default: 0 },
        },
        resolve: {
          willpower: { type: Number, default: 0 },
          empathy: { type: Number, default: 0 },
        },
        // Escape hatch: only used if you decide a module adds extra sub-aspects.
        extra: { type: Map, of: Number, default: {} },
      },

      // Dynamic maps
      skills: { type: Map, of: Number, default: {} },

      features: { type: [String], default: [] },

      resources: {
        hp: { type: ResourceTrackSchema, default: () => ({ current: 0, max: 0, temp: 0 }) },
        threads: { type: ResourceTrackSchema, default: () => ({ current: 0, max: 0, temp: 0 }) },
        resolve: { type: ResourceTrackSchema, default: () => ({ current: 0, max: 0, temp: 0 }) },
        other: { type: Map, of: Number, default: {} },
      },

      conditions: { type: [ConditionInstanceSchema], default: [] },
      inventory: { type: [InventoryItemSchema], default: [] },

      notes: { type: String, default: '' },
    },

    meta: {
      lastPlayedAt: { type: Date, default: null },
      deletedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// ---- Indexes (Sheets page + search) ----

CharacterSchema.index({ campaign: 1, player: 1, status: 1, updatedAt: -1 });

// List a player’s sheets quickly (newest first)
CharacterSchema.index({ player: 1, status: 1, updatedAt: -1 });

// Useful for sorting/searching inside a player’s list
CharacterSchema.index({ player: 1, name: 1 });

// Optional: text search across name/tags (fine for MVP)
CharacterSchema.index({ name: 'text', tags: 'text' });

export default mongoose.model<CharacterType>('Character', CharacterSchema);
