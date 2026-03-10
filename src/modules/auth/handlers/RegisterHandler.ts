import { AuthType } from '../model/Auth';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { RoleRegistry } from '../utils/RoleRegistry';
import { ProfileCreationFactory } from '../factory/ProfileCreationFactory';
// import { PaymentService } from '../service/PaymentService';
import BillingAccount, { BillingAccountType } from '../model/BillingAccount';
import slugify from 'slugify';
import Notification from '../../notification/model/Notification';
import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { ModelMap } from '../../../utils/ModelMap';
import { PlayerType } from '../../profiles/player/model/PlayerModel';

type RegisterInput = {
  email: string;
  password: string;
  roles: string[];
  firstName: string;
  lastName?: string;
  [key: string]: any;
};

export class RegisterHandler {
  private user!: any;
  private profileRefs: Record<string, string | null> = {};
  private customerCreated = false;
  private data!: RegisterInput;
  private billingAccount!: BillingAccountType;
  private modelMap: Record<string, any>;

  /**
   * @description Initializes the RegisterHandler with user data.
   * @param data - An object containing email, password, and roles of the user.
   */
  constructor() {
    this.modelMap = ModelMap;
  }

  /**
   * @description Executes the registration process by creating a user and their profiles, and generating a JWT token.
   * @returns {Promise<{token: string, profileRefs: Record<string, string | null>, billing: {status: string, requiresVaultSetup: boolean}}>}
   * @throws {Error} If any step in the registration process fails.
   */
  public async execute(data: RegisterInput): Promise<{
    user: any;
    token: string;
    profileRefs: Record<string, string | null>;
    billing: { status: string; requiresVaultSetup: boolean };
  }> {
    try {
      this.data = data;
      console.log(data);
      // Ensure 'player' is in the roles array for MVP - everyone gets a player profile
      if (!this.data.player.roles || !this.data.player.roles.includes('player')) {
        this.data.player.roles = this.data.player.roles || [];
        this.data.player.roles.unshift('player');
        console.info('[RegistrationHandler]: Auto-adding player role to user roles');
      }

      await this.createUser(this.data.auth);
      await this.createProfiles(this.data.player);

      const token = jwt.sign(
        {
          userId: this.user._id,
          roles: this.data.player.roles,
          profileRefs: this.profileRefs,
        },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );
      // query the admin table to get all admins and populate their emails
      // role is an array of strings, so we need to use $in operator
      const admins = await this.modelMap['admin'].find({ role: { $in: ['admin'] } });

      // for each admin, create a notification in the system
      for (const admin of admins) {
        await Notification.insertNotification(
          admin._id as any,
          null as any, // switch this to a centralized admin user id later
          'Registration Event',
          `New user registered: ${this.user.email}`,
          `user_registered`,
          this.user._id as any
        );
      }
      const result = {
        token,
        profileRefs: this.profileRefs,
        billing: {
          status: 'trialing',
          requiresVaultSetup: this.customerCreated,
        },
        user: this.user,
      };

      // Reset state after successful execution
      this.resetState();

      return result;
    } catch (error: any) {
      console.error(error);
      // Reset state after failed execution
      this.resetState();
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  /**
   * @description Creates a new user in the database. It checks if the email is already registered and hashes the password before saving.
   * @throws {Error} If the email is already registered.
   */
  private async createUser(authData: { email: string; password: string }) {
    console.info(`[RegistrationHander]: attempting to create user with email: ${authData.email}`);

    const existingUser = await this.isEmailRegistered(authData.email);
    if (existingUser) {
      throw new ErrorUtil('Email already registered', 400);
    }

    // create a slug of the user's full name
    const fullName = `${this.data.player.firstName} ${this.data.player.lastName || ''}`.trim();
    const sluggedName = slugify(fullName, {
      lower: true,
      strict: true, // removes special characters
      trim: true, // removes leading and trailing whitespace
    });

    this.user = await this.modelMap['auth'].create(authData);

    // unique tail to the access key to avoid collisions
    const uniqueTail = this.user._id.toString().slice(-6);
    this.user.accessKey = `${sluggedName}-${uniqueTail}`;
    // Note: We'll save the user once at the end of createProfiles() to avoid multiple saves
  }

  /**
   * @description Creates profiles for the user based on their roles. Each role has a specific profile creator that handles the profile creation logic.
   * @throws {Error} If any profile creation fails, it will clean up the user and any created profiles.
   */
  private async createProfiles(profileData: PlayerType) {
    const role = profileData.roles[0]; // Assuming the first role is the primary one for profile creation; should always be "player"
    const creator = ProfileCreationFactory.getProfileCreator(role);
    try {
      const profile = await creator!.createProfile(this.user._id, profileData);
      this.profileRefs[role] = profile.profileId;

      const roleMeta = RoleRegistry[role];
      if (roleMeta?.isBillable && !this.customerCreated) {
        // await this.createBillingAccount(profile.profileId, role);
        // this.customerCreated = true;
      }
    } catch (err) {
      console.error(`[RegistrationHandler]: Failed to create profile for role ${role}:`, err);
      await this.cleanupOnFailure();
      throw new Error(`Failed to create ${role} profile`);
    } finally {
      // Set both profileRefs and accessKey, then save only once
      this.user.profileRefs = this.profileRefs;
      await this.user.save();
    }
  }

  /**
   * @description Creates a billing account for the user based on their profile and role. However this does not handle the payment method setup, that is handled in the payment service.
   * @throws {Error} If the billing account creation fails.
   * @param profileId - The ID of the profile for which the billing account is being created.
   * @param role - The role of the user for which the billing account is being created.
   */
  private async createBillingAccount(profileId: string, role: string) {
    console.info(`[RegistrationHandler]: Creating billing account..`);
    try {
      this.billingAccount = await BillingAccount.create({
        profileId: profileId as any,
        profileType: role,
        email: this.data.email,
        status: 'active',
        vaulted: false,
        payor: this.user._id,
      });
      console.info(`[RegistrationHandler]: Billing account created for profile ${profileId} with role ${role}`);
    } catch (error: any) {
      console.error(`[RegistrationHandler]: Failed to create billing account for profile ${profileId} with role ${role}:`, error);
      throw new Error(`Failed to create billing account: ${error.message}`);
    }
  }

  /**
   * @description Cleans up the user and their profiles if any step in the registration process fails.
   * This ensures that no partial data is left in the database.
   */
  private async cleanupOnFailure() {
    await Promise.all([
      this.modelMap['auth'].findByIdAndDelete(this.user._id),
      BillingAccount.findByIdAndDelete(this.billingAccount?._id),
      ...Object.entries(this.user.profileRefs)
        .filter(([_, pid]) => !!pid) // filter out any null or undefined profile IDs
        .map(([role, pid]) => mongoose.model(role).findByIdAndDelete(pid)), // delete profiles by role
    ]);
  }

  /**
   * @Description checks if the email is already registered in the system.
   * @param email - The email to check for registration.
   */
  public async isEmailRegistered(email: string): Promise<boolean> {
    const user = await this.modelMap['auth'].findOne({ email }).lean();
    return !!user;
  }

  /**
   * @description Sets verification token and expiration for email verification.
   * @param email - The email to set the verification token for.
   */
  public async setEmailVerificationToken(email: string): Promise<{ token: string; user: AuthType }> {
    const user = await this.modelMap['auth'].findOne({ email });
    if (!user) throw new Error('User not found');
    const token = await crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour
    user.emailVerificationToken = token;
    user.emailVerificationExpires = expires;
    await user.save();

    return { token, user };
  }

  /**
   * @description Verifies the user's email using the provided token.
   * @param token - The verification token sent to the user's email.
   */
  public async verifyEmail(token: string): Promise<{ message: string; user: AuthType }> {
    const user = await this.modelMap['auth'].findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });
    if (!user) throw new ErrorUtil('Invalid or expired token', 400);
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    return { message: 'Email verified successfully', user };
  }

  /**
   * @description Resets all instance state to prevent data bleeding between registrations.
   * This should be called after each execute() call, whether successful or failed.
   */
  private resetState(): void {
    this.user = undefined;
    this.profileRefs = {};
    this.customerCreated = false;
    this.data = undefined as any;
    this.billingAccount = undefined as any;
  }
}
