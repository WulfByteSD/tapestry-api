import express from 'express';
import settingsRoutes from './settings';
import itemsRoutes from './items';
import skillsRoutes from './skills';

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Content service is up and running',
  });
});

router.use('/settings', settingsRoutes);
router.use('/items', itemsRoutes);
router.use('/skills', skillsRoutes);

export default router;
