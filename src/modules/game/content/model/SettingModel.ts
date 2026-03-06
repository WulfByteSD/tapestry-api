import mongoose from 'mongoose';

export type ContentStatus = 'draft' | 'published' | 'archived';

export interface SettingModules {
  items: boolean;
  lore: boolean;
  maps: boolean;
  magic: boolean;
}

export interface SettingType extends mongoose.Document {
  key: string;
  name: string;
  description?: string;
  status: ContentStatus;
  tags: string[];
  rulesetVersion: number;
  modules: SettingModules;
  createdAt: Date;
  updatedAt: Date;
}

const SettingModulesSchema = new mongoose.Schema(
  {
    items: { type: Boolean, default: true },
    lore: { type: Boolean, default: false },
    maps: { type: Boolean, default: false },
    magic: { type: Boolean, default: false },
  },
  { _id: false }
);

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
    },
    tags: { type: [String], default: [] },
    rulesetVersion: { type: Number, default: 1 },
    modules: { type: SettingModulesSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    collection: 'content_settings',
  }
);

SettingSchema.index({ key: 1 }, { unique: true });
SettingSchema.index({ status: 1, updatedAt: -1 });
SettingSchema.index({ name: 'text', description: 'text', tags: 'text' });

export default mongoose.model<SettingType>('Setting', SettingSchema);
