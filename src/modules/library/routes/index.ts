import express from 'express';
import ragRoutes from './rag.routes';
import resourceRoutes from './resource.routes';

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Library service is up and running',
  });
});

router.use('/resources', resourceRoutes);
router.use('/admin/rag', ragRoutes);

export default router;
