import mongoose from 'mongoose';

/**
 * Represents an attack configuration for a weapon or ability.
 */
export interface AttackProfile {
  key: string;
  name: string;
  attackKind?: 'melee' | 'ranged' | 'spell' | 'special';
  defaultAspect?: string;
  allowedSkillKeys?: string[];
  modifier?: number;
  harm?: number | string;
  rangeLabel?: string;
  tags?: string[];
  notes?: string;
}

export const AttackProfileSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    attackKind: {
      type: String,
      enum: ['melee', 'ranged', 'spell', 'special'],
      default: 'melee',
    },
    defaultAspect: { type: String, trim: true, default: null },
    allowedSkillKeys: { type: [String], default: [] },
    modifier: { type: Number, default: 0 },
    harm: { type: mongoose.Schema.Types.Mixed, default: null },
    rangeLabel: { type: String, trim: true, default: null },
    tags: { type: [String], default: [] },
    notes: { type: String, default: '' },
  },
  { _id: false }
);
