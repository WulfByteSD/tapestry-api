import mongoose from 'mongoose';

/**
 * Represents an ability that a character has learned.
 */
export type CharacterLearnedAbility = {
  abilityId: string;
  abilityKey: string;
  sourceType: 'learned';
  notes?: string;
  prepared?: boolean;
};

export const CharacterLearnedAbilitySchema = new mongoose.Schema(
  {
    abilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AbilityDefinition', required: true },
    abilityKey: { type: String, required: true, trim: true, lowercase: true },
    sourceType: { type: String, enum: ['learned'], default: 'learned' },
    notes: { type: String, default: '', trim: true },
  },
  { _id: false }
);
