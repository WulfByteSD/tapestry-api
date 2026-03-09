import mongoose from 'mongoose';
import { GrantedAbilityRefSchema } from '../../../schemas/GrantedAbilitySchema';
import { AttackProfileSchema, AttackProfile } from './AttackProfileSchema';

/**
 * Reference to a canonical item definition.
 */
export interface InventoryDefinitionRef {
  itemKey: string;
  sourceId?: string;
  settingKey?: string;
  version?: number;
}

/**
 * Player-specific overrides for an inventory item.
 */
export interface InventoryOverrides {
  displayName?: string;
  modifier?: number;
  harm?: number | string;
  tags?: string[];
}

/**
 * Represents an item in a character's inventory.
 */
export interface InventoryItem {
  instanceId?: string;
  protection?: number;
  definition?: InventoryDefinitionRef;
  stackable?: boolean;
  itemKey?: string;
  sourceId?: string;
  name?: string;
  qty: number;
  tags?: string[];
  notes?: string;
  category?: 'weapon' | 'armor' | 'gear' | 'consumable' | 'tool' | 'currency' | 'quest' | 'other';
  equipped?: boolean;
  slot?: string;
  attackProfiles?: AttackProfile[];
  selectedAttackProfileKey?: string;
  overrides?: InventoryOverrides;
}

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

export const InventoryItemSchema = new mongoose.Schema(
  {
    instanceId: { type: String, trim: true },
    stackable: { type: Boolean, default: false },
    definition: { type: InventoryDefinitionRefSchema, default: null },
    protection: { type: Number, default: null },
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
    grantedAbilities: { type: [GrantedAbilityRefSchema], default: [] },
    attackProfiles: { type: [AttackProfileSchema], default: [] },
    selectedAttackProfileKey: { type: String, trim: true, default: null },
    overrides: { type: InventoryOverridesSchema, default: null },
  },
  { _id: false }
);
