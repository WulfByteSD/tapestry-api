import mongoose from 'mongoose';

export type ContentStatus = 'draft' | 'published' | 'archived';
export type InventoryCategory = 'weapon' | 'armor' | 'gear' | 'consumable' | 'tool' | 'currency' | 'quest' | 'other';

export type AttackKind = 'melee' | 'ranged' | 'spell' | 'special';
export type ItemScope = 'shared' | 'setting';

export interface AttackProfile {
  key: string;
  name: string;
  attackKind?: AttackKind;
  defaultAspect?: string;
  allowedSkillKeys?: string[];
  modifier?: number;
  harm?: number | string;
  rangeLabel?: string;
  tags?: string[];
  notes?: string;
}

export interface ItemDefinitionType extends mongoose.Document {
  key: string;
  name: string;
  category: InventoryCategory;
  status: ContentStatus;
  settingKeys: string[];
  tags: string[];
  equippable: boolean;
  slot?: string;
  stackable: boolean;
  protection?: number;
  notes?: string;
  attackProfiles: AttackProfile[];
  grantedAbilities: GrantedAbilityRef[];
  createdAt: Date;
  updatedAt: Date;
}
export interface GrantedAbilityRef {
  abilityId: mongoose.Types.ObjectId;
  abilityKey: string;
  requiresEquipped?: boolean;
  grantMode?: 'passive' | 'active';
  notes?: string;
}

const GrantedAbilityRefSchema = new mongoose.Schema(
  {
    abilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AbilityDefinition',
      required: true,
    },
    abilityKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    requiresEquipped: {
      type: Boolean,
      default: true,
    },
    grantMode: {
      type: String,
      enum: ['passive', 'active'],
      default: 'active',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
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
    notes: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const ItemDefinitionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['weapon', 'armor', 'gear', 'consumable', 'tool', 'currency', 'quest', 'other'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
      index: true,
    },
    settingKeys: {
      type: [String],
      required: true,
      default: [],
      index: true,
    },
    tags: { type: [String], default: [] },
    equippable: { type: Boolean, default: false },
    slot: { type: String, trim: true, default: null },
    stackable: { type: Boolean, default: false },
    protection: { type: Number, default: 0 },
    notes: { type: String, default: '', trim: true },
    attackProfiles: { type: [AttackProfileSchema], default: [] },
    grantedAbilities: { type: [GrantedAbilityRefSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'content_item_definitions',
  }
);

ItemDefinitionSchema.index({ key: 1 }, { unique: true });
ItemDefinitionSchema.index({ settingKeys: 1, category: 1, status: 1 });
ItemDefinitionSchema.index({ name: 'text', key: 'text', tags: 'text' });

export default mongoose.model<ItemDefinitionType>('ItemDefinition', ItemDefinitionSchema);
