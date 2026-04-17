import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { AuthType } from '../../auth/model/Auth';
import PlayerModel from '../../profiles/player/model/PlayerModel';
import { EmailService } from '../email/EmailService';

export default class RegistrationEventHandler {
  async userRegistered(event: { user: AuthType }) {
    const { user } = event;
    if (!user) {
      console.log('No user data provided in userRegistered event');
      return;
    }
    const playerProfile = await PlayerModel.findOne({ user: user._id as any }).lean();
    console.info(`[Notification] New user registered with email: ${user.email}`);
    try {
      await EmailService.sendEmail({
        to: user.email,
        subject: `Welcome to ${process.env.APP_NAME || 'Tapestry - TTRPG'}!`,
        templateId: 'registration-email-tapestry',
        data: {
          name: playerProfile?.displayName,
          actionUrl: `${process.env.FRONTEND_URL}`,
          discordLink: process.env.DISCORD_INVITE_LINK,
          currentYear: new Date().getFullYear(),
          subject: `Welcome to ${process.env.APP_NAME || 'Tapestry - TTRPG'}!`,
        },
      });
    } catch (error) {
      console.error('Failed to send registration email:', error);
    }
  }
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
        templateId: 'password-reset-success-tapestry',
        data: {
          currentYear: new Date().getFullYear(),
          subject: 'Your Password Has Been Reset Successfully',
          portalUrl: `https://app.tapestry-ttrpg.com/`,
          supportEmail: 'support@tapestry-ttrpg.com'
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
        subject: 'Please Verify Your Email',
        templateId: 'verification-email-tapestry',
        data: {
          name: user.firstName,
          currentYear: new Date().getFullYear(),
          verificationUrl: verificationUrl,
          subject: 'Please Verify Your Email',
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
        templateId: 'reset-password-copy-tapestry',
        data: {
          resetUrl: resetUrl,
          supportEmail: `support@tapestry-ttrpg.com`,
          currentYear: new Date().getFullYear(),
          subject: 'Password Reset Request',
          expirationTime: '10 minutes',
          discordLink: process.env.DISCORD_INVITE_LINK,
        },
      });
    } catch (err: any) {
      console.error('Failed to send password reset email:', err);
      throw new ErrorUtil('Failed to send password reset email', 500);
    }
  }
}
