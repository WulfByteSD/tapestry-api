import { ErrorUtil } from '../../../middleware/ErrorUtil';
import type { ProductPricing } from '../models/ProductModel';

export function isFreePricing(pricing: ProductPricing): boolean {
  return pricing.type === 'free';
}

export function validatePricing(pricing: ProductPricing): void {
  if (!pricing) {
    throw new ErrorUtil('Invalid pricing', 400);
  }

  if (!['free', 'one_time'].includes(pricing.type)) {
    throw new ErrorUtil('Invalid pricing', 400);
  }

  if (pricing.currency !== 'USD') {
    throw new ErrorUtil('Invalid pricing', 400);
  }

  if (!Number.isInteger(pricing.amountCents) || pricing.amountCents < 0) {
    throw new ErrorUtil('Invalid pricing', 400);
  }

  if (pricing.compareAtAmountCents !== undefined && (!Number.isInteger(pricing.compareAtAmountCents) || pricing.compareAtAmountCents < 0)) {
    throw new ErrorUtil('Invalid pricing', 400);
  }

  if (pricing.type === 'free' && pricing.amountCents !== 0) {
    throw new ErrorUtil('Invalid pricing', 400);
  }

  if (pricing.type === 'one_time' && pricing.amountCents <= 0) {
    throw new ErrorUtil('Invalid pricing', 400);
  }
}

export function formatAmountCents(amountCents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
}
