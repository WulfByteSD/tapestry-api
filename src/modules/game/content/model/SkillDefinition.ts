import mongoose from 'mongoose';

export type ContentStatus = 'draft' | 'published' | 'archived';
export type SkillCategory = 'social' | 'combat' | 'technical' | 'knowledge' | 'survival' | 'magic' | 'other';

export interface SkillDefinitionType extends mongoose.Document {
  key: string;
  name: string;
  status: ContentStatus;
  settingKeys: string[];
  category?: SkillCategory;
  defaultAspect?: string;
  tags: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SkillDefinitionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
    },
    settingKeys: { type: [String], default: [] },
    category: {
      type: String,
      enum: ['social', 'combat', 'technical', 'knowledge', 'survival', 'magic', 'other'],
      default: 'other',
    },
    defaultAspect: { type: String, trim: true, default: null },
    tags: { type: [String], default: [] },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

SkillDefinitionSchema.index({ key: 1 }, { unique: true });
SkillDefinitionSchema.index({ status: 1, settingKeys: 1 });

export const SkillDefinitionModel = mongoose.models.SkillDefinition || mongoose.model<SkillDefinitionType>('SkillDefinition', SkillDefinitionSchema);
