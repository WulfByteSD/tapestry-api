// Independent of resource category and fulfillment. Omitted on legacy records.
export type ProductType = 'book' | 'merchandise' | 'other';
export type ProductStatus = 'draft' | 'published' | 'archived';
export type ProductVisibility = 'public' | 'unlisted' | 'private';
export type PricingType = 'free' | 'one_time';
export type FulfillmentKind = 'digital' | 'physical' | 'mixed';
export type ProductGrantPermission = 'view' | 'download';

export interface ProductGrantInput {
  type: 'resource';
  resourceId: string;
  permissions: ProductGrantPermission[];
}

export interface CreateProductInput {
  key: string;
  slug: string;
  title: string;
  productType?: ProductType;
  subtitle?: string;
  summary?: string;
  description?: string;
  status?: ProductStatus;
  visibility?: ProductVisibility;
  pricing: {
    type: PricingType;
    currency: 'USD';
    amountCents: number;
    compareAtAmountCents?: number;
  };
  presentation?: {
    /** Legacy unassigned artwork; never a banner or an inferred book cover. */
    imageUrl?: string;
    bannerImageUrl?: string;
    productImageUrl?: string;
    coverImageUrl?: string;
    gallery?: Array<{
      url: string;
      alt?: string;
      caption?: string;
    }>;
  };
  fulfillment: {
    kind: FulfillmentKind;
    grants: ProductGrantInput[];
    requiresShipping: boolean;
  };
  tags?: string[];
}

export interface AcquireProductInput {
  userId: string;
  productId: string;
  acquisitionType: 'claim';
}
