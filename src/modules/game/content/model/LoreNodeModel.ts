// tapestry-api/src/modules/game/content/model/LoreNodeModel.ts
import mongoose from 'mongoose';

export type ContentStatus = 'draft' | 'published' | 'archived';

export type LoreRelationType = {
  type: string;
  targetId: string;
  targetKey?: string;
  label?: string;
  notes?: string;
};

export type LoreMetaType = {
  imageUrl?: string;
  bannerUrl?: string;
  coordinates?: {
    x: number | null;
    y: number | null;
  };
  regionLabel?: string;
};

export interface LoreNodeType extends mongoose.Document {
  settingKey: string;
  key: string;
  name: string;
  kind: string;
  status: ContentStatus;
  parentId?: string | null;
  ancestorIds?: string[];
  depth: number;
  sortOrder: number;
  tags: string[];
  summary: string;
  body: string;
  relations: LoreRelationType[];
  meta: LoreMetaType;
  createdAt?: Date;
  updatedAt?: Date;
}
const LoreRelationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'LoreNode', required: true },
    targetKey: { type: String, trim: true, default: null },
    label: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const LoreMetaSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, trim: true, default: '' },
    bannerUrl: { type: String, trim: true, default: '' },
    coordinates: {
      x: { type: Number, default: null },
      y: { type: Number, default: null },
    },
    regionLabel: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const LoreNodeSchema = new mongoose.Schema(
  {
    settingKey: { type: String, required: true, trim: true, index: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ['region', 'nation', 'province', 'settlement', 'district', 'landmark', 'faction', 'npc', 'organization', 'culture', 'religion', 'event', 'history', 'other'],
      default: 'other',
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoreNode',
      default: null,
      index: true,
    },
    ancestorIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LoreNode',
      default: [],
      index: true,
    },
    depth: { type: Number, default: 0, index: true },
    sortOrder: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    summary: { type: String, trim: true, default: '' },
    body: { type: String, trim: true, default: '' },
    relations: { type: [LoreRelationSchema], default: [] },
    meta: { type: LoreMetaSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    collection: 'content_lore_nodes',
  }
);

LoreNodeSchema.index({ settingKey: 1, key: 1 }, { unique: true });
LoreNodeSchema.index({ settingKey: 1, parentId: 1, sortOrder: 1 });
LoreNodeSchema.index({ name: 'text', summary: 'text', body: 'text', tags: 'text' });

export default mongoose.model<LoreNodeType>('LoreNode', LoreNodeSchema);
