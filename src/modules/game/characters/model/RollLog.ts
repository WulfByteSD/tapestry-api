import mongoose, { Types } from 'mongoose';

/**
 * RollLog Type Definition
 *
 * Tracks all dice rolls made by characters (or storyweavers without a character).
 * Records complete roll data, metadata, and context for auditing.
 */
export interface RollLogType extends mongoose.Document {
  // References
  character: Types.ObjectId | null; // ref Character (nullable for storyweaver rolls)
  player: Types.ObjectId; // ref Player (denormalized for faster queries)
  campaign: Types.ObjectId | null; // ref Campaign (optional)

  // Roll Data (from DiceRollerService AdvancedRollResult)
  expression: string; // e.g., "4d6b3+2"
  allRolls: number[]; // All dice rolled: [6, 4, 3, 1]
  keptRolls: number[]; // Dice kept after edge/burden: [6, 4, 3]
  total: number; // Final result: 15
  breakdown?: string; // Human-readable: "Rolled: [6,4,3,1] → Kept: [6,4,3] = 13 +2"

  // Metadata
  rollType: string; // "attack", "skill", "damage", "custom"
  context?: string; // Free-text description: "Attacking bandit #2"
  aspectUsed?: string; // Aspect/skill reference: "might.strength"

  // Timestamps
  rolledAt: Date; // When the roll occurred
  createdAt: Date; // Auto-managed by mongoose
  updatedAt: Date; // Auto-managed by mongoose
}

const RollLogSchema = new mongoose.Schema(
  {
    character: {
      type: Types.ObjectId,
      ref: 'Character',
      default: null,
      index: true,
    },
    player: {
      type: Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true,
    },
    campaign: {
      type: Types.ObjectId,
      ref: 'Campaign',
      default: null,
      index: true,
    },
    expression: {
      type: String,
      required: true,
      trim: true,
    },
    allRolls: {
      type: [Number],
      required: true,
    },
    keptRolls: {
      type: [Number],
      required: true,
    },
    total: {
      type: Number,
      required: true,
    },
    breakdown: {
      type: String,
      trim: true,
    },
    rollType: {
      type: String,
      required: true,
      default: 'custom',
      trim: true,
    },
    context: {
      type: String,
      trim: true,
    },
    aspectUsed: {
      type: String,
      trim: true,
    },
    rolledAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    collection: 'roll_logs',
  }
);

// TTL Index: Auto-delete rolls older than 90 days
RollLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound indexes for common query patterns
RollLogSchema.index({ character: 1, rolledAt: -1 });
RollLogSchema.index({ campaign: 1, rolledAt: -1 });
RollLogSchema.index({ player: 1, rolledAt: -1 });

const RollLog = mongoose.model<RollLogType>('RollLog', RollLogSchema);

export default RollLog;
