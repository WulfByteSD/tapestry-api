import mongoose from 'mongoose';
import slugify from 'slugify';
import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { CRUDHandler } from '../../../utils/baseCRUD';
import Resource from '../../library/models/Resource';
import ProductModel, { ProductDocument, ProductFulfillment, ProductPricing } from '../models/ProductModel';
import { isFreePricing, validatePricing } from '../helpers/pricing.helpers';

export default class ProductHandler extends CRUDHandler<ProductDocument> {
  constructor() {
    super(ProductModel);
  }

  protected async beforeCreate(data: any): Promise<void> {
    data.key = this.normalizeRequiredKey(data.key);
    data.slug = this.normalizeRequiredSlug(data.slug || data.title);
    data.tags = this.normalizeTags(data.tags);
    data.pricing = this.normalizePricing(data.pricing);
    data.fulfillment = await this.normalizeAndValidateFulfillment(data.fulfillment, data.pricing);
  }

  protected async beforeUpdate(id: string, data: any): Promise<void> {
    const existing = await this.Schema.findById(id).lean();
    if (!existing) {
      throw new ErrorUtil('Product not found', 404);
    }

    if ('key' in data) {
      data.key = this.normalizeRequiredKey(data.key);
    }

    if ('slug' in data || 'title' in data) {
      data.slug = this.normalizeRequiredSlug(data.slug || existing.slug);
    }

    if ('tags' in data) {
      data.tags = this.normalizeTags(data.tags);
    }

    if ('pricing' in data) {
      data.pricing = this.normalizePricing({
        ...existing.pricing,
        ...data.pricing,
      });
    }

    if ('fulfillment' in data || 'pricing' in data) {
      const mergedPricing = ('pricing' in data ? data.pricing : existing.pricing) as ProductPricing;
      data.fulfillment = await this.normalizeAndValidateFulfillment(
        {
          ...existing.fulfillment,
          ...data.fulfillment,
          grants: data.fulfillment?.grants ?? existing.fulfillment?.grants ?? [],
        },
        mergedPricing
      );
    }
  }

  async fetchBySlug(slug: string) {
    return await this.Schema.findOne({ slug }).lean();
  }

  private normalizeRequiredKey(value: unknown): string {
    const normalized = slugify(String(value || '').trim(), { lower: true, strict: true }).trim();
    if (!normalized) {
      throw new ErrorUtil('Product key is required', 400);
    }

    return normalized;
  }

  private normalizeRequiredSlug(value: unknown): string {
    const normalized = slugify(String(value || '').trim(), { lower: true, strict: true }).trim();
    if (!normalized) {
      throw new ErrorUtil('Product slug is required', 400);
    }

    return normalized;
  }

  private normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return [...new Set(value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))];
  }

  private normalizePricing(pricing: any): ProductPricing {
    const normalized: ProductPricing = {
      type: pricing?.type,
      currency: pricing?.currency || 'USD',
      amountCents: Number(pricing?.amountCents),
      ...(pricing?.compareAtAmountCents !== undefined && pricing?.compareAtAmountCents !== null
        ? { compareAtAmountCents: Number(pricing.compareAtAmountCents) }
        : {}),
    };

    validatePricing(normalized);
    return normalized;
  }

  private async normalizeAndValidateFulfillment(fulfillment: any, pricing: ProductPricing): Promise<ProductFulfillment> {
    if (!fulfillment || !['digital', 'physical', 'mixed'].includes(fulfillment.kind)) {
      throw new ErrorUtil('Invalid fulfillment configuration', 400);
    }

    const grants = await this.normalizeAndValidateGrants(fulfillment.grants);
    const normalized: ProductFulfillment = {
      kind: fulfillment.kind,
      grants,
      requiresShipping: Boolean(fulfillment.requiresShipping),
    };

    if (normalized.kind === 'physical' && normalized.grants.length > 0) {
      throw new ErrorUtil('Invalid fulfillment configuration', 400);
    }

    if (normalized.kind === 'digital' && normalized.requiresShipping) {
      throw new ErrorUtil('Invalid fulfillment configuration', 400);
    }

    if (isFreePricing(pricing) && normalized.grants.length === 0) {
      throw new ErrorUtil('Invalid fulfillment configuration', 400);
    }

    return normalized;
  }

  private async normalizeAndValidateGrants(grants: any): Promise<ProductFulfillment['grants']> {
    if (!Array.isArray(grants) || grants.length === 0) {
      return [];
    }

    const normalized = grants.map((grant) => {
      const resourceId = String(grant?.resourceId || '').trim();
      const permissions: Array<'view' | 'download'> = Array.isArray(grant?.permissions)
        ? ([
            ...new Set(
              grant.permissions
                .map((permission: unknown) => String(permission).trim())
                .filter((permission: string): permission is 'view' | 'download' => ['view', 'download'].includes(permission))
            ),
          ] as Array<'view' | 'download'>)
        : [];

      if (grant?.type !== 'resource' || !mongoose.Types.ObjectId.isValid(resourceId) || permissions.length === 0) {
        throw new ErrorUtil('Invalid fulfillment configuration', 400);
      }

      return {
        type: 'resource' as const,
        resourceId: new mongoose.Types.ObjectId(resourceId),
        permissions,
      };
    });

    const uniqueResourceIds = [...new Set(normalized.map((grant) => grant.resourceId.toString()))];
    const existingResourceCount = await Resource.countDocuments({ _id: { $in: uniqueResourceIds } });

    if (existingResourceCount !== uniqueResourceIds.length) {
      throw new ErrorUtil('Invalid fulfillment configuration', 400);
    }

    return normalized;
  }
}
