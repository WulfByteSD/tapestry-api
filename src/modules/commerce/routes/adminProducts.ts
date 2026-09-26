import express, { NextFunction, Request, Response } from 'express';
import { AuthMiddleware } from '../../../middleware/AuthMiddleware';
import ProductService from '../service/ProductService';

const router = express.Router();
const service = new ProductService();

const stampCreatedBy = (req: Request, _res: Response, next: NextFunction) => {
  const authenticatedRequest = req as any;
  req.body.createdBy = authenticatedRequest.user._id;
  req.body.updatedBy = authenticatedRequest.user._id;
  next();
};

const stampUpdatedBy = (req: Request, _res: Response, next: NextFunction) => {
  const authenticatedRequest = req as any;
  req.body.updatedBy = authenticatedRequest.user._id;
  next();
};

router.use(AuthMiddleware.protect);
router.use(AuthMiddleware.authorizeRoles(['admin', 'developer']) as any);

router.get('/', service.getResources);
router.get('/:id', service.getResource);
router.post('/', stampCreatedBy, service.create);
router.put('/:id', stampUpdatedBy, service.updateResource);
router.delete('/:id', service.removeResource);

export default router;
