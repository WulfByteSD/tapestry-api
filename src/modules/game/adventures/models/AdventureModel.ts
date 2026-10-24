import mongoose, { Schema } from 'mongoose';
import { StoredContent } from '../types/adventure.contracts';

export interface AdventureRecord extends StoredContent {
  libraryResourceId: string;
  status: 'draft' | 'published' | 'archived';
  revision: number;
  publishedAt?: Date;
  publishedContent?: StoredContent;
  publishedRevision?: number;
}
const embedded = { _id: false, strict: 'throw' as const };
const assetSchema = new Schema(
  {
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'raw'], required: true },
    format: { type: String, required: true },
    contentType: { type: String, required: true },
    bytes: { type: Number, required: true },
  },
  embedded
);
const resourceSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    kind: { type: String, enum: ['map', 'handout', 'story_text', 'storyweaver_note'], required: true },
    visibility: { type: String, enum: ['players', 'storyweaver'], default: 'storyweaver' },
    text: { type: String, default: '' },
    tags: { type: [String], default: [] },
    asset: { type: assetSchema, default: undefined },
  },
  embedded
);
const sectionSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    storyText: String,
    storyweaverNotes: String,
    context: String,
    sortOrder: Number,
    resourceIds: [String],
    encounterIds: [String],
    links: [new Schema({ sectionId: String, label: String, context: String }, embedded)],
  },
  embedded
);
const encounterSchema = new Schema(
  {
    id: { type: String, required: true },
    title: String,
    notes: String,
    combatants: [new Schema({ combatantId: { type: String, required: true }, quantity: { type: Number, min: 1, required: true } }, embedded)],
  },
  embedded
);
const contentSchema = new Schema(
  {
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    sections: { type: [sectionSchema], default: [] },
    resources: { type: [resourceSchema], default: [] },
    encounters: { type: [encounterSchema], default: [] },
  },
  embedded
);
const adventureSchema = new Schema<AdventureRecord>(
  {
    libraryResourceId: { type: String, required: true, unique: true, immutable: true },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    revision: { type: Number, default: 0 },
    publishedAt: Date,
    publishedContent: { type: contentSchema, default: undefined },
    publishedRevision: Number,
    sections: { type: [sectionSchema], default: [] },
    resources: { type: [resourceSchema], default: [] },
    encounters: { type: [encounterSchema], default: [] },
  },
  { timestamps: true, strict: 'throw', collection: 'adventures' }
);

export const Adventure = mongoose.model<AdventureRecord>('Adventure', adventureSchema);
