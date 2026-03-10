import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { AuthType } from '../../auth/model/Auth';
import { EmailService } from '../email/EmailService';

export default class RegistrationEventHandler {
  async passwordResetCompleted(event: { user: AuthType }) {
    const { user } = event;
    if (!user) {
      throw new ErrorUtil('User data is required for password reset completion event handling', 400);
    }
    console.info(`[Notification] Password reset completed for email: ${user.email}`);
    try {
      await EmailService.sendEmail({
        to: user.email,
        subject: 'Your Password Has Been Reset Successfully',
        templateId: 'd-100b051843c146f5b2e19633f004a15b',
        data: {
          currentYear: new Date().getFullYear(),
          subject: 'Your Password Has Been Reset Successfully',
        },
      });
    } catch (err: any) {
      console.error('Failed to send password reset completion email:', err);
      throw new ErrorUtil('Failed to send password reset completion email', 500);
    }
  }
  public emailVerification = async (event: any): Promise<void> => {
    try {
      const { user } = event;
      console.info(`[Notification] Email Verification for email: ${user.email}`);
      const verificationUrl = `${process.env.FRONTEND_AUTH_URL}/verify-email?token=${user.emailVerificationToken}`;
      await EmailService.sendEmail({
        to: user.email,
        subject: 'Welcome to FreeAgent Portal - Please Verify Your Email',
        templateId: 'd-ef91fa3ddf554f33b6efdd205c181f7b',
        data: {
          firstName: user.firstName,
          currentYear: new Date().getFullYear(),
          verificationLink: verificationUrl,
          subject: 'Welcome to FreeAgent Portal - Please Verify Your Email',
        },
      });
    } catch (err: any) {
      console.error(err.response?.body?.errors);
      throw new ErrorUtil('Failed to handle user verify email event', 500);
    }
  };

  async emailVerified(event: any): Promise<void> {
    const { user } = event;
    if (!user) {
      throw new Error('User data is required for email verification event handling');
    }

    // Logic to handle email verification, e.g., logging or sending a confirmation email
    console.info(`[Notification] Email verified for user: ${user.email}`);
    try {
      await EmailService.sendEmail({
        to: user.email,
        subject: 'Your Email Has Been Verified',
        templateId: 'd-249bb1a6027346ccbd25344eadbe14d4',
        data: {
          firstName: user.firstName,
          currentYear: new Date().getFullYear(),
          subject: 'Your Email Has Been Verified',
        },
      });
    } catch (err: any) {
      console.error('Failed to send email verification confirmation:', err);
      throw new ErrorUtil('Failed to send email verification confirmation', 500);
    }
  }

  async passwordReset(event: { email: string; token: string }): Promise<void> {
    const { email, token } = event;
    if (!email || !token) {
      throw new ErrorUtil('Email and token are required for password reset event handling', 400);
    }
    console.info(`[Notification] Password reset requested for email: ${email}`);
    // build the reset url
    const resetUrl = `${process.env.FRONTEND_AUTH_URL}/reset-password?token=${token}`;
    try {
      await EmailService.sendEmail({
        to: email,
        subject: 'Password Reset Request',
        templateId: 'd-a10af4698c09420fbd7c766a1ca1a99e',
        data: {
          resetLink: resetUrl,
          currentYear: new Date().getFullYear(),
          subject: 'Password Reset Request',
          expirationTime: '10 minutes',
        },
      });
    } catch (err: any) {
      console.error('Failed to send password reset email:', err);
      throw new ErrorUtil('Failed to send password reset email', 500);
    }
  }
}
