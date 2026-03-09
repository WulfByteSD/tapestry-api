import mongoose from 'mongoose';
import { AspectBlock } from '../schemas/characters/AspectBlockSchema';
import { ResourceTrack, ResourceTrackSchema } from '../schemas/characters/ResourceTrackSchema';
import { ConditionInstance, ConditionInstanceSchema } from '../schemas/characters/ConditionInstanceSchema';
import { NoteCard, NoteCardSchema } from '../schemas/characters/NoteCardSchema';
import { AttackProfile } from '../schemas/characters/AttackProfileSchema';
import { InventoryItem, InventoryItemSchema } from '../schemas/characters/InventoryItemSchema';
import { CharacterProfile } from '../schemas/characters/CharacterProfileSchema';
import { CharacterLearnedAbility, CharacterLearnedAbilitySchema } from '../schemas/characters/CharacterLearnedAbilitySchema';

export type SheetStatus = 'active' | 'archived';

// Re-export types for convenience
export type { AspectBlock, ResourceTrack, ConditionInstance, NoteCard, AttackProfile, InventoryItem, CharacterProfile, CharacterLearnedAbility };

export interface CharacterType extends mongoose.Document {
  player: string;
  campaign?: string | null;
  name: string;
  avatarUrl?: string | null;
  status: SheetStatus;
  tags: string[];

  settingKey?: string;
  toneModules?: string[];
  rulesetVersion?: number;

  sheet: {
    archetypeKey?: string;
    weaveLevel: number;
    profile?: CharacterProfile;
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

    skills: Record<string, number>;
    features: string[];
    resources: {
      hp: ResourceTrack;
      threads: ResourceTrack;
      resolve?: ResourceTrack;
      other: Record<string, number>;
    };
    conditions: ConditionInstance[];
    inventory: InventoryItem[];
    noteCards: NoteCard[];
    learnedAbilities: CharacterLearnedAbility[];
  };

  forkedFrom?: string | null;
  createdAt: string;
  updatedAt: string;
  meta: {
    lastPlayedAt?: Date | null;
    deletedAt?: Date | null; // soft delete (optional)
  };
}

// ----- All sub-schemas are now imported from ./schemas folder -----

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
      profile: {
        title: { type: String, trim: true },
        bio: { type: String, trim: true },
        race: { type: String, trim: true },
        nationality: { type: String, trim: true },
        religion: { type: String, trim: true },
        sex: { type: String, trim: true },
        height: { type: String, trim: true },
        weight: { type: String, trim: true },
        eyes: { type: String, trim: true },
        hair: { type: String, trim: true },
        ethnicity: { type: String, trim: true },
        age: { type: Number, default: null },
        extra: { type: Map, of: String, default: {} },
      },
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
      learnedAbilities: { type: [CharacterLearnedAbilitySchema], default: [] },
      conditions: { type: [ConditionInstanceSchema], default: [] },
      inventory: { type: [InventoryItemSchema], default: [] },

      noteCards: { type: [NoteCardSchema], default: [] },
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
