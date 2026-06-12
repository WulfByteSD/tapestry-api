import { v4 as uuidv4 } from 'uuid';
import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { RAGHandler } from '../../library/handlers/Rag.handler';
import ProductModel from '../models/ProductModel';
import type { AcquireProductInput } from '../types/commerce.types';
import { getResourceGrants, hasResourceGrants } from '../helpers/productGrant.helpers';
import { isFreePricing } from '../helpers/pricing.helpers';

type ClaimGrantResult = {
  type: 'resource';
  resourceId: string;
  permissions: Array<'view' | 'download'>;
  status: 'granted' | 'already_owned';
};

type ClaimResult = {
  productId: string;
  acquired: boolean;
  alreadyOwned: boolean;
  grants: ClaimGrantResult[];
};

export default class ProductAcquisitionHandler {
  private readonly resourceGrantHandler = new RAGHandler();

  async claim(input: AcquireProductInput): Promise<ClaimResult> {
    const product = await ProductModel.findById(input.productId);

    if (!product) {
      throw new ErrorUtil('Product not found', 404);
    }

    if (product.status === 'archived') {
      throw new ErrorUtil('Product archived', 400);
    }

    if (product.status !== 'published') {
      throw new ErrorUtil('Product not published', 400);
    }

    if (!isFreePricing(product.pricing)) {
      throw new ErrorUtil('Product is not claimable without checkout.', 400);
    }

    if (!hasResourceGrants(product)) {
      throw new ErrorUtil('Product has no resource grants', 400);
    }

    const grants = getResourceGrants(product);
    const sourceId = uuidv4();
    const results: ClaimGrantResult[] = [];

    for (const grant of grants) {
      try {
        const result = await this.resourceGrantHandler.grantAccessForUser({
          authUserId: input.userId,
          resourceId: grant.resourceId.toString(),
          permissions: grant.permissions,
          source: {
            type: 'claim',
            productId: product._id.toString(),
            sourceId,
          },
        });

        results.push({
          type: 'resource',
          resourceId: grant.resourceId.toString(),
          permissions: grant.permissions,
          status: result.status,
        });
      } catch (error) {
        if (error instanceof ErrorUtil) {
          throw error;
        }

        throw new ErrorUtil('Resource grant failed', 500);
      }
    }

    return {
      productId: product._id.toString(),
      acquired: results.some((grant) => grant.status === 'granted'),
      alreadyOwned: results.length > 0 && results.every((grant) => grant.status === 'already_owned'),
      grants: results,
    };
  }
}
