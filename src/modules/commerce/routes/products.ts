import express, { NextFunction, Request, Response } from 'express';
import ProductService from '../service/ProductService';

const router = express.Router();
const service = new ProductService({ publicOnly: true });

const enforcePublicCatalogFilters = (req: Request, _res: Response, next: NextFunction) => {
  const existing = typeof req.query.filterOptions === 'string' ? req.query.filterOptions : '';
  const enforced = existing ? `${existing}|status;published|visibility;public` : 'status;published|visibility;public';

  req.query.filterOptions = enforced;
  next();
};

router.get('/', enforcePublicCatalogFilters, service.getResources);
router.get('/slug/:slug', service.getBySlug);
router.get('/:id', service.getResource);

export default router;
