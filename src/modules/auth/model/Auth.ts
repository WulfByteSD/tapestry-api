import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * @description Interface for the User model
 *
 * @author Austin Howard
 * @since 1.0
 * @version 1.0
 * @lastModified - 2023-06-11T16:20:26.000-05:00
 */
export interface AuthType extends mongoose.Document {
  customerId: string;
  email: string;
  password: string;
  role: string[];
  isActive: boolean;
  notificationSettings: Record<string, boolean>;
  accessKey: string;
  createdAt: Date;
  updatedAt: Date;
  isEmailVerified: boolean;
  acceptedPolicies: Record<string, number>;
  permissions: string[];
  lastSignedIn: Date | undefined | null;
  profileRefs: Record<string, string | null>;
  getSignedJwtToken: () => string;
  getResetPasswordToken: () => string;
  matchPassword: (enteredPassword: string) => boolean;
}

const AuthSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 10,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true, // soft delete
    },
    role: [
      {
        type: String,
        default: ['user'],
        enum: ['user', 'admin', 'scout', 'agent'],
      },
    ],
    lastSignedIn: {
      type: Date,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    permissions: {
      type: [String],
      default: ['user.all'],
    },
    acceptedPolicies: {
      type: Map,
      of: Number, // version stamp when they accepted the policy
    },
    profileRefs: {
      type: Object,
      default: {},
    },
    accessKey: {
      type: String,
      select: false, // do not return this field by default
    },
    notificationSettings: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt password before saving new user
// Should hash the password on registration.
AuthSchema.pre('save', async function (next: any) {
  //conditional will check to see if the password is being modified so it wont update the password constantly.
  if (!this.isModified('password')) {
    return next;
    }
    const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password!, salt);
  next;
});

// Sign JWT and return
AuthSchema.methods.getSignedJwtToken = function () {
  // JWT_SECRET is an environment variable, use the ! to tell typescript that it will be there.
  // as this method requires the JWT_SECRET to be set, it cannot be null or undefined.
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET!, {
    expiresIn: '30d',
  });
};

// Match user entered password to hashed password in database
AuthSchema.methods.matchPassword = async function (enteredPassword: string) {
  return await bcrypt.compare(enteredPassword, this.password);
};
// enforces that the email string be lower case throughout, as if it isnt, a user with
// test@email.com and a user Test@email.com do not match, and you can end up with duplicate emails..
AuthSchema.pre('save', async function (next: any) {
  this.email = this.email!.toLowerCase();
  next;
});

// Generate and hash password token
AuthSchema.methods.getResetPasswordToken = async function () {
  // Generate a token
  // this returns a buffer, we want to make it into a string
  const resetToken = crypto.randomBytes(20).toString('hex');
  // Hash token and set to resetPasswordToken field.
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Set expiration, 10 minutes
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  // save the user
  await this.save({ validateBeforeSave: true });
  return resetToken;
};

export default mongoose.model<AuthType>('Auth', AuthSchema);
