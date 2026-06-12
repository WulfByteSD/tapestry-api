import { Request, Response } from 'express';
import asyncHandler from '../../../middleware/asyncHandler';
import error from '../../../middleware/error';
import { CRUDService } from '../../../utils/baseCRUD';
import ProductHandler from '../handlers/Product.handler';

type ProductServiceOptions = {
  publicOnly?: boolean;
};

export default class ProductService extends CRUDService {
  private readonly productHandler: ProductHandler;
  private readonly publicOnly: boolean;

  constructor(options: ProductServiceOptions = {}) {
    super(ProductHandler);

    this.productHandler = this.handler as ProductHandler;
    this.publicOnly = Boolean(options.publicOnly);

    this.queryKeys = ['key', 'slug', 'title', 'subtitle', 'summary', 'description', 'tags'];

    this.requiresAuth = {
      create: true,
      updateResource: true,
      removeResource: true,
    };
  }

  protected async beforeCreate(data: any): Promise<void> {
    if ('user' in data) {
      delete data.user;
    }
  }

  public getResource = async (req: Request, res: Response): Promise<Response> => {
    try {
      await this.beforeFetch(req.params.id as any);
      const result = await this.handler.fetch(req.params.id);
      await this.afterFetch(result);

      if (!result || (this.publicOnly && !this.isPublicProduct(result))) {
        return res.status(404).json({ message: 'Product not found' });
      }

      return res.status(200).json({
        success: true,
        payload: {
          ...result,
        },
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  };

  getBySlug = asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await this.productHandler.fetchBySlug(req.params.slug);

      if (!result || (this.publicOnly && !this.isPublicProduct(result))) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      return res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });

  private isPublicProduct(product: any): boolean {
    return product?.status === 'published' && product?.visibility === 'public';
  }
}
