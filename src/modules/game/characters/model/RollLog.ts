import mongoose, { Types } from "mongoose";

export interface AttackLogType {
  targetNumber: number;
  margin: number;
  outcome: "miss" | "weak_hit" | "hit" | "strong_hit";
  targetLabel?: string;

  weaponInstanceId?: string | null;
  itemKey?: string | null;

  weaponNameSnapshot?: string;
  attackProfileKey?: string | null;
  attackNameSnapshot?: string | null;
}

export interface RollLogType extends mongoose.Document {
  character: Types.ObjectId | null;
  player: Types.ObjectId;
  campaign: Types.ObjectId | null;

  expression: string;
  allRolls: number[];
  keptRolls: number[];
  total: number;
  breakdown?: string;

  rollType: string;
  context?: string;
  aspectUsed?: string;

  attack?: AttackLogType;

  rolledAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttackLogSchema = new mongoose.Schema(
  {
    targetNumber: { type: Number, required: true },
    margin: { type: Number, required: true },
    outcome: {
      type: String,
      enum: ["miss", "weak_hit", "hit", "strong_hit"],
      required: true,
    },
    targetLabel: { type: String, trim: true },

    weaponInstanceId: { type: String, default: null },
    itemKey: { type: String, default: null },

    weaponNameSnapshot: { type: String, trim: true },
    attackProfileKey: { type: String, default: null },
    attackNameSnapshot: { type: String, trim: true },
  },
  { _id: false }
);

const RollLogSchema = new mongoose.Schema(
  {
    character: { type: Types.ObjectId, ref: "Character", default: null, index: true },
    player: { type: Types.ObjectId, ref: "Player", required: true, index: true },
    campaign: { type: Types.ObjectId, ref: "Campaign", default: null, index: true },

    expression: { type: String, required: true, trim: true },
    allRolls: { type: [Number], required: true },
    keptRolls: { type: [Number], required: true },
    total: { type: Number, required: true },
    breakdown: { type: String, trim: true },

    rollType: { type: String, required: true, default: "custom", trim: true },
    context: { type: String, trim: true },
    aspectUsed: { type: String, trim: true },

    attack: { type: AttackLogSchema, default: null },

    rolledAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: "roll_logs" }
);

RollLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
RollLogSchema.index({ character: 1, rolledAt: -1 });
RollLogSchema.index({ campaign: 1, rolledAt: -1 });
RollLogSchema.index({ player: 1, rolledAt: -1 });

export default mongoose.model("RollLog", RollLogSchema);