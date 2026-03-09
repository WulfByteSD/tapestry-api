import mongoose from 'mongoose';

/**
 * Represents a condition applied to a character (e.g., "poisoned", "exposed").
 */
export interface ConditionInstance {
  key: string;
  stacks?: number;
  appliedAt?: Date;
  expiresAt?: Date | null;
  source?: string;
  notes?: string;
}

export const ConditionInstanceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    stacks: { type: Number, default: 1 },
    appliedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, default: null },
    source: { type: String, trim: true },
    notes: { type: String },
  },
  { _id: false }
);
