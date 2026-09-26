import express from 'express';
import authRoutes from '../../modules/auth/route/authRoutes';
import supportRoutes from '../../modules/support/routes/index';
import paymentRoutes from '../../modules/payment/routes/index';
import uploadRoutes from '../../modules/upload/routes/index';
import notificationRoutes from '../../modules/notification/route/index';
import adminRoutes from '../../modules/profiles/admin/route/index';
import profileRoutes from '../../modules/profiles/routes/index';
import gameRoutes from '../../modules/game/routes/index';
import commerceRoutes from '../../modules/commerce/routes/index';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/support', supportRoutes);
router.use('/payment', paymentRoutes);
router.use('/upload', uploadRoutes);
router.use('/notification', notificationRoutes);
router.use('/profiles', profileRoutes);
router.use('/game', gameRoutes);
router.use('/commerce', commerceRoutes);
router.use('/library', require('../../modules/library/routes/index').default);

// TODO: Remove these when the new profile routes are fully integrated
router.use('/admin', adminRoutes);

router.route('/').get((req, res) => {
  res.status(200).json({
    message: 'API V1 is working',
  });
});

export default router;
