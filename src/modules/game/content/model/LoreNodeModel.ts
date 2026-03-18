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

type LoreNodeMedia = {
  portraitUrl?: string;
  bannerUrl?: string;
  tokenUrl?: string;
  gallery?: Array<{
    id: string;
    url: string;
    kind: 'image' | 'video';
    title?: string;
    caption?: string;
    alt?: string;
  }>;
  embeds?: Array<{
    id: string;
    kind: 'youtube' | 'vimeo' | 'audio' | 'other';
    url: string;
    title?: string;
    caption?: string;
  }>;
};

type LoreNodeIdentity = {
  subtitle?: string;
  epithet?: string;
  aliases?: string[];
  pronunciation?: string;
  title?: string;
};
type LoreNodeClassification = {
  species?: string;
  culture?: string;
  occupation?: string;
  affiliation?: string[];
  religion?: string[];
  region?: string;
  settlement?: string;
};
type LoreNodeWorld = {
  regionLabel?: string;
  coordinates?: {
    x?: number | null;
    y?: number | null;
  };
  era?: string;
  timelineNote?: string;
};
type LoreNodeStory = {
  hooks?: string[];
  rumors?: string[];
  secrets?: string[];
  quotes?: string[];
  gmNotes?: string[];
};
type LinkedContentRef = {
  type: 'combatant';
  targetId: string;
  label?: string;
};
export interface LoreNodeType extends mongoose.Document {
  settingKey: string;
  key: string;
  name: string;
  kind: string;
  status: 'draft' | 'published' | 'archived';
  parentId?: string | null;
  ancestorIds: string[];
  depth: number;
  sortOrder: number;
  tags: string[];
  summary?: string;
  body?: string;
  relations: LoreRelationType[];
  linkedContent?: LinkedContentRef[];
  meta?: {
    media?: LoreNodeMedia;
    identity?: LoreNodeIdentity;
    classification?: LoreNodeClassification;
    world?: LoreNodeWorld;
    story?: LoreNodeStory;
  };
  createdAt?: string;
  updatedAt?: string;
}

const LinkedContentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    label: { type: String, trim: true, default: '' },
  },
  { _id: false }
);
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
    media: {
      portraitUrl: { type: String, trim: true, default: '' },
      bannerUrl: { type: String, trim: true, default: '' },
      tokenUrl: { type: String, trim: true, default: '' },
      gallery: [
        {
          id: { type: String, required: true },
          url: { type: String, required: true },
          kind: { type: String, enum: ['image', 'video'], required: true },
          title: { type: String, trim: true, default: '' },
          caption: { type: String, trim: true, default: '' },
          alt: { type: String, trim: true, default: '' },
        },
      ],
      embeds: [
        {
          id: { type: String, required: true },
          kind: { type: String, enum: ['youtube', 'vimeo', 'audio', 'other'], required: true },
          url: { type: String, required: true },
          title: { type: String, trim: true, default: '' },
          caption: { type: String, trim: true, default: '' },
        },
      ],
    },
    identity: {
      subtitle: { type: String, trim: true, default: '' },
      epithet: { type: String, trim: true, default: '' },
      aliases: { type: [String], default: [] },
      pronunciation: { type: String, trim: true, default: '' },
      title: { type: String, trim: true, default: '' },
    },
    classification: {
      species: { type: String, trim: true, default: '' },
      culture: { type: String, trim: true, default: '' },
      occupation: { type: String, trim: true, default: '' },
      affiliation: { type: [String], default: [] },
      religion: { type: [String], default: [] },
      region: { type: String, trim: true, default: '' },
      settlement: { type: String, trim: true, default: '' },
    },
    world: {
      regionLabel: { type: String, trim: true, default: '' },
      coordinates: {
        x: { type: Number, default: null },
        y: { type: Number, default: null },
      },
      era: { type: String, trim: true, default: '' },
      timelineNote: { type: String, trim: true, default: '' },
    },
    story: {
      hooks: { type: [String], default: [] },
      rumors: { type: [String], default: [] },
      secrets: { type: [String], default: [] },
      quotes: { type: [String], default: [] },
      gmNotes: { type: [String], default: [] },
    },
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
    linkedContent: { type: [LinkedContentSchema], default: [] },
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
