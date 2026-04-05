import mongoose, { Schema, InferSchemaType } from 'mongoose';

const AttackSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    harm: { type: String, required: true, trim: true }, // Light (2), Heavy (8), etc
    range: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const AbilitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true },
    cooldown: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const LoreCheckSchema = new Schema(
  {
    skill: { type: String, trim: true, default: 'Wit [Knowledge]' },
    tn: { type: Number, default: 10 },
    villagers: { type: [String], default: [] },
    priests: { type: [String], default: [] },
    scholars: { type: [String], default: [] },
    soldiers: { type: [String], default: [] },
  },
  { _id: false }
);

const MediaSchema = new Schema(
  {
    portraitUrl: { type: String, trim: true, default: '' },
    tokenUrl: { type: String, trim: true, default: '' },
    bannerUrl: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const CombatantSchema = new Schema(
  {
    settingKeys: {
      type: [String],
      required: true,
      default: [],
      index: true,
    },

    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: ['npc', 'creature', 'unwoven', 'boss', 'ally', 'hazard'],
      default: 'creature',
      index: true,
    },

    disposition: {
      type: String,
      enum: ['hostile', 'neutral', 'friendly'],
      default: 'hostile',
      index: true,
    },

    loreNodeId: {
      type: Schema.Types.ObjectId,
      ref: 'LoreNode',
      default: null,
      index: true,
    },

    tier: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },

    origin: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },

    role: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },

    perks: {
      type: [String],
      default: [],
    },

    statline: {
      hp: { type: Number, required: true, min: 1 },
      defenseTN: { type: Number, required: true, min: 1 },
      harm: { type: String, required: true, trim: true },
      armor: { type: Number, default: 0, min: 0 },
      move: { type: String, trim: true, default: '' },
      actions: { type: Number, default: 1, min: 1 },
      tags: { type: [String], default: [] },
    },

    attacks: {
      type: [AttackSchema],
      default: [],
    },

    abilities: {
      type: [AbilitySchema],
      default: [],
    },

    loreCheck: {
      type: LoreCheckSchema,
      default: () => ({}),
    },

    backgroundBehavior: {
      type: String,
      trim: true,
      default: '',
    },

    whereFound: {
      type: [String],
      default: [],
    },

    tactics: {
      type: [String],
      default: [],
    },

    hooks: {
      type: [String],
      default: [],
    },

    notes: {
      public: { type: String, trim: true, default: '' },
      gm: { type: String, trim: true, default: '' },
    },

    media: {
      type: MediaSchema,
      default: () => ({}),
    },

    sourceType: {
      type: String,
      enum: ['original', 'derived_from_lore', 'quick_saved'],
      default: 'original',
    },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'combatants',
  }
);

CombatantSchema.index({ key: 1, settingKeys: 1 }, { unique: true });
CombatantSchema.index({ name: 'text', key: 'text', role: 'text', origin: 'text' });

export type CombatantType = InferSchemaType<typeof CombatantSchema> & mongoose.Document;

export default mongoose.models.Combatant || mongoose.model('Combatant', CombatantSchema);
