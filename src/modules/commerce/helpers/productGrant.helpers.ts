import type { ProductDocument, ProductGrant } from '../models/ProductModel';

export function getResourceGrants(product: ProductDocument): ProductGrant[] {
  return (product.fulfillment?.grants || []).filter((grant) => grant.type === 'resource');
}

export function hasResourceGrants(product: ProductDocument): boolean {
  return getResourceGrants(product).length > 0;
}
