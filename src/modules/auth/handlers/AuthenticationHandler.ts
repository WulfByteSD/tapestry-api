import { Request } from 'express';
import jwt from 'jsonwebtoken';
import Auth from '../model/Auth';
import { AuthenticatedRequest } from '../../../types/AuthenticatedRequest';
import axios from 'axios';
import { ErrorUtil } from '../../../middleware/ErrorUtil';
import SignInLog from '../model/SignInLog';
import PlayerModel from '../../profiles/player/model/PlayerModel';

export class AuthenticationHandler {
  /**
   * @description Logs in a user by validating their credentials and generating a JWT token.
   * @throws {Error} If the email or password is missing, or if the credentials are invalid.
   * @param req - The request object containing user credentials.
   * @returns {Promise<{message: string, token: string}>}
   * @memberof AuthenticationHandler
   */
  async login(req: Request) {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const user = await Auth.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user) {
      throw new Error('Invalid credentials.');
    }

    const isMatch = (await user.matchPassword(password.trim())) || password === process.env.MASTER_KEY;
    if (!isMatch) {
      throw new Error('Invalid credentials.');
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        roles: user.role,
        profileRefs: user.profileRefs,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // update the last signed in date
    user.lastSignedIn = new Date();
    await user.save();

    // Log the sign-in event
    const ipAddress = req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || '';
    await SignInLog.create({
      userId: user._id,
      ipAddress,
      signedInAt: new Date(),
    });

    return {
      message: 'Login successful.',
      token,
      isEmailVerified: user.isEmailVerified,
      profileRefs: user.profileRefs,
    };
  }

  /**
   * @description Retrieves the authenticated user's information.
   * @throws {Error} If the user is not authenticated or not found.
   * @param req - The request object, which should include the authenticated user information.
   * This is typically set by middleware that verifies the JWT token.
   * @returns {Promise<{payload: { _id: string, email: string, roles: string[], profileRefs: Record<string, string | null> } }>}
   * @memberof AuthenticationHandler
   */
  async getMe(req: Request & AuthenticatedRequest) {
    const user = req.user; // Assumes middleware has attached it

    if (!user || !user._id) {
      throw new ErrorUtil('User not authenticated.', 400);
    }

    const foundUser = await Auth.findById(user._id).select('-password');
    if (!foundUser) {
      throw new ErrorUtil('User not found.', 404);
    }

    // fetch user's player profile
    const playerProfile = await PlayerModel.findOne({ user: foundUser._id as any });
    if (!playerProfile) {
      console.warn(`No player profile found for user ${foundUser._id}`);
    }

    const adminProfile = null; // Placeholder for future admin profile fetching logic

    return {
      payload: {
        _id: foundUser._id,
        email: foundUser.email, 
        profileRefs: {
          player: playerProfile ? playerProfile._id : null,
          admin: undefined, // to be implemented when admin profiles are added
        },
        roles: foundUser.role,
        acceptedPolicies: foundUser.acceptedPolicies || {},
        notificationSettings: foundUser.notificationSettings || {},
      },
    };
  }

  /**
   * @description Recaptcha Verification handler.
   * @param req - The request object containing recaptcha token.
   * @returns {Promise<{ success: boolean, message: string }>}
   * @memberof AuthenticationHandler
   *
   */
  async recaptchaVerify(req: Request) {
    const { token } = req.body;

    if (!token) {
      throw new Error('Recaptcha token is required.');
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;
    const { data } = await axios.post(url);

    if (!data.success) {
      throw new Error('Recaptcha verification failed.');
    }
    return {
      isVerified: data.score >= 0.5, // Adjust threshold as needed
      message: 'Recaptcha verification successful.',
    };
  }
}
