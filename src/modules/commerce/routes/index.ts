import express from 'express';
import { AuthMiddleware } from '../../../middleware/AuthMiddleware';
import ProductAcquisitionService from '../service/ProductAcquisitionService';
import adminProductRoutes from './adminProducts';
import productRoutes from './products';

const router = express.Router();
const acquisitionService = new ProductAcquisitionService();

router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Commerce service is up and running',
  });
});

router.use('/products', productRoutes);
router.use('/admin/products', adminProductRoutes);

router.post('/products/:productId/claim', AuthMiddleware.protect, acquisitionService.claim);

export default router;
