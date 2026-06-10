import mongoose from 'mongoose';

type ResourceKind = 'guide' | 'module' | 'dial' | 'quickstart' | 'reference' | 'map' | 'printable' | 'other';

type ResourceFormat = 'pdf' | 'web' | 'audio' | 'video' | 'archive' | 'external';

type ResourceAccessPolicy = 'public' | 'entitlement';

export interface IResource extends mongoose.Document {
  key: string;
  slug: string;

  title: string;
  subtitle?: string;
  summary?: string;
  description?: string;

  kind: ResourceKind;
  format: ResourceFormat;

  status: 'draft' | 'published' | 'archived';
  accessPolicy: ResourceAccessPolicy;

  presentation: {
    coverImageUrl?: string;
    spineImageUrl?: string;
    thumbnailImageUrl?: string;
    bannerImageUrl?: string;
  };

  currentRelease: {
    version: string;
    provider: 'cloudinary' | 's3' | 'external';
    assetKey: string;
    mimeType?: string;
    sizeBytes?: number;
    publishedAt?: Date;
  };

  tags: string[];
  authors?: string[];
  publishedAt?: Date;
}

const ResourceSchema = new mongoose.Schema<IResource>(
  {
    key: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    subtitle: { type: String },
    summary: { type: String },
    description: { type: String },
    kind: { type: String, enum: ['guide', 'module', 'dial', 'quickstart', 'reference', 'map', 'printable', 'other'], required: true },
    format: { type: String, enum: ['pdf', 'web', 'audio', 'video', 'archive', 'external'], required: true },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    accessPolicy: { type: String, enum: ['public', 'entitlement'], default: 'public' },
    presentation: {
      coverImageUrl: { type: String },
      spineImageUrl: { type: String },
      thumbnailImageUrl: { type: String },
      bannerImageUrl: { type: String },
    },
    currentRelease: {
      version: { type: String, required: true },
      provider: { type: String, enum: ['cloudinary', 's3', 'external'], required: true },
      assetKey: { type: String, required: true },
      mimeType: { type: String },
      sizeBytes: { type: Number },
      publishedAt: { type: Date },
    },
    tags: { type: [String], default: [] },
    authors: { type: [String], default: [] },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IResource>('Resource', ResourceSchema);
