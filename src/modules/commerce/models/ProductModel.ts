import mongoose from 'mongoose';
import type { FulfillmentKind, PricingType, ProductGrantPermission, ProductStatus, ProductVisibility } from '../types/commerce.types';

export interface ProductGrant {
  type: 'resource';
  resourceId: mongoose.Types.ObjectId;
  permissions: ProductGrantPermission[];
}

export interface ProductPricing {
  type: PricingType;
  currency: 'USD';
  amountCents: number;
  compareAtAmountCents?: number;
}

export interface ProductPresentationGalleryItem {
  url: string;
  alt?: string;
  caption?: string;
}

export interface ProductPresentation {
  imageUrl?: string;
  coverImageUrl?: string;
  gallery?: ProductPresentationGalleryItem[];
}

export interface ProductFulfillment {
  kind: FulfillmentKind;
  grants: ProductGrant[];
  requiresShipping: boolean;
}

export interface ProductDocument extends mongoose.Document {
  key: string;
  slug: string;
  title: string;
  subtitle?: string;
  summary?: string;
  description?: string;
  status: ProductStatus;
  visibility: ProductVisibility;
  pricing: ProductPricing;
  presentation?: ProductPresentation;
  fulfillment: ProductFulfillment;
  tags: string[];
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProductGrantSchema = new mongoose.Schema<ProductGrant>(
  {
    type: {
      type: String,
      enum: ['resource'],
      required: true,
      default: 'resource',
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: true,
    },
    permissions: {
      type: [
        {
          type: String,
          enum: ['view', 'download'],
          required: true,
        },
      ],
      default: [],
    },
  },
  { _id: false }
);

const ProductPricingSchema = new mongoose.Schema<ProductPricing>(
  {
    type: {
      type: String,
      enum: ['free', 'one_time'],
      required: true,
    },
    currency: {
      type: String,
      enum: ['USD'],
      required: true,
      default: 'USD',
    },
    amountCents: {
      type: Number,
      required: true,
      validate: {
        validator(value: number) {
          return Number.isInteger(value);
        },
        message: 'Pricing amountCents must be an integer value',
      },
    },
    compareAtAmountCents: {
      type: Number,
      validate: {
        validator(value: number | undefined) {
          return value === undefined || Number.isInteger(value);
        },
        message: 'Pricing compareAtAmountCents must be an integer value',
      },
    },
  },
  { _id: false }
);

const ProductPresentationGalleryItemSchema = new mongoose.Schema<ProductPresentationGalleryItem>(
  {
    url: { type: String, required: true, trim: true },
    alt: { type: String, trim: true },
    caption: { type: String, trim: true },
  },
  { _id: false }
);

const ProductPresentationSchema = new mongoose.Schema<ProductPresentation>(
  {
    imageUrl: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
    gallery: { type: [ProductPresentationGalleryItemSchema], default: [] },
  },
  { _id: false }
);

const ProductFulfillmentSchema = new mongoose.Schema<ProductFulfillment>(
  {
    kind: {
      type: String,
      enum: ['digital', 'physical', 'mixed'],
      required: true,
    },
    grants: { type: [ProductGrantSchema], default: [] },
    requiresShipping: { type: Boolean, default: false },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema<ProductDocument>(
  {
    key: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    summary: { type: String, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    visibility: {
      type: String,
      enum: ['public', 'unlisted', 'private'],
      default: 'private',
    },
    pricing: { type: ProductPricingSchema, required: true },
    presentation: { type: ProductPresentationSchema },
    fulfillment: { type: ProductFulfillmentSchema, required: true },
    tags: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Auth' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Auth' },
  },
  {
    timestamps: true,
    collection: 'commerce_products',
  }
);

ProductSchema.index({ key: 1 }, { unique: true });
ProductSchema.index({ slug: 1 }, { unique: true });
ProductSchema.index({ status: 1 });
ProductSchema.index({ visibility: 1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({
  title: 'text',
  subtitle: 'text',
  summary: 'text',
  description: 'text',
  tags: 'text',
});

export default mongoose.model<ProductDocument>('CommerceProduct', ProductSchema);
