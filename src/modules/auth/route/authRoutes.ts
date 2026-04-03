import express from 'express';
import AuthService from '../service/AuthService';
import { AuthMiddleware } from '../../../middleware/AuthMiddleware';
import { AuthenticationHandler } from '../handlers/AuthenticationHandler';
import { PasswordRecoveryHandler } from '../handlers/PasswordRecoveryHandler';
import { RegisterHandler } from '../handlers/RegisterHandler';
import { AdminAuthService } from '../service/AdminAuth.service';
import featureRoutes from './featureRoutes';
import planRoutes from './planRoutes';
import legalRoutes from './legalRoutes';
import billingRoutes from './billingRoutes';

const router = express.Router();

const authService = new AuthService(new AuthenticationHandler(), new PasswordRecoveryHandler(), new RegisterHandler());
const adminAuthService = new AdminAuthService();

router.use('/feature', featureRoutes);
router.use('/plan', planRoutes);
router.use('/legal', legalRoutes);
router.use('/billing', billingRoutes);

router.route('/:email/email').get(authService.checkEmail);
router.post('/register', authService.register);
router.route('/recaptcha').post(authService.recaptcha);
router.route('/reset-password/:resettoken').put(authService.resetPassword);
router.route('/forgot-password').post(authService.forgotPassword);
router.route('/verifyEmail').post(authService.verifyEmail);
router.route('/resend-verification-email').post(authService.resendVerificationEmail);
router.route('/login').post(authService.login);
router.route('/health').get((req, res) => {
  res.status(200).json({
    message: 'Auth service is up and running',
    success: true,
  });
});

// authenticated routes
router.get('/me', AuthMiddleware.protect, authService.getMe);

// Admin routes - CRUD operations on user accounts
router.use('/users', AuthMiddleware.protect);
router.route('/users/:id').get(adminAuthService.getResource).put(adminAuthService.updateResource);

router.use('/users', AuthMiddleware.authorizeRoles(['*', 'admin', 'moderator', 'developer', 'support']) as any);
router.route('/users').post(adminAuthService.create).get(adminAuthService.getResources);

router.route('/users/:id/reset-password').post(adminAuthService.updatePassword);

// Fine-tuned access - only developers and users with special permissions can delete
router.route('/users/:id').delete(AuthMiddleware.authorizeRoles(['users.delete', 'developer']) as any, adminAuthService.removeResource);

export default router;
