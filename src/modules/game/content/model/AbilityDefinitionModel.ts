import mongoose from 'mongoose';

export type ContentStatus = 'draft' | 'published' | 'archived';

export type AbilityCategory = 'spell' | 'technique' | 'augment' | 'program' | 'prayer' | 'mutation' | 'feature' | 'other';

export type AbilitySourceType = 'learned' | 'item-granted' | 'implant-granted' | 'feature-granted' | 'innate';

export type AbilityActivation = 'action' | 'bonus' | 'reaction' | 'passive' | 'downtime' | 'special';

export type AbilityUsageModel = 'at-will' | 'resource-cost' | 'per-scene' | 'per-rest' | 'cooldown' | 'charges';

export interface AbilityCost {
  resourceKey?: string;
  amount?: number;
  charges?: number;
  cooldownTurns?: number;
}

export interface AbilityDefinitionType extends mongoose.Document {
  key: string;
  name: string;
  status: ContentStatus;
  settingKeys: string[];
  category: AbilityCategory;
  sourceType: AbilitySourceType;
  activation: AbilityActivation;
  usageModel: AbilityUsageModel;
  cost?: AbilityCost;
  defaultAspect?: string;
  allowedSkillKeys?: string[];
  tags: string[];
  summary?: string;
  effectText?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AbilityCostSchema = new mongoose.Schema(
  {
    resourceKey: { type: String, trim: true, default: null },
    amount: { type: Number, default: null },
    charges: { type: Number, default: null },
    cooldownTurns: { type: Number, default: null },
  },
  { _id: false }
);

const AbilityDefinitionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
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
    category: {
      type: String,
      enum: ['spell', 'technique', 'augment', 'program', 'prayer', 'mutation', 'feature', 'other'],
      default: 'other',
      index: true,
    },
    sourceType: {
      type: String,
      enum: ['learned', 'item-granted', 'implant-granted', 'feature-granted', 'innate'],
      default: 'learned',
      index: true,
    },
    activation: {
      type: String,
      enum: ['action', 'bonus', 'reaction', 'passive', 'downtime', 'special'],
      default: 'action',
    },
    usageModel: {
      type: String,
      enum: ['at-will', 'resource-cost', 'per-scene', 'per-rest', 'cooldown', 'charges'],
      default: 'at-will',
    },
    cost: { type: AbilityCostSchema, default: null },
    defaultAspect: { type: String, trim: true, default: null },
    allowedSkillKeys: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    summary: { type: String, default: '', trim: true },
    effectText: { type: String, default: '', trim: true },
  },
  {
    timestamps: true,
    collection: 'content_ability_definitions',
  }
);

AbilityDefinitionSchema.index({ key: 1 }, { unique: true });
AbilityDefinitionSchema.index({ settingKeys: 1, category: 1, status: 1 });
AbilityDefinitionSchema.index({ name: 'text', key: 'text', tags: 'text', summary: 'text', effectText: 'text' });

export default mongoose.model<AbilityDefinitionType>('AbilityDefinition', AbilityDefinitionSchema);
