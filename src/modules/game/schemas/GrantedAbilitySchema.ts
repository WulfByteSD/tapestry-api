import mongoose from 'mongoose';

/**
 * Shared interface for abilities granted by items, archetypes, or other sources.
 * Used across CharacterModel and ItemDefinitionModel.
 */
export interface GrantedAbilityRef {
  abilityId: mongoose.Types.ObjectId;
  abilityKey: string;
  requiresEquipped?: boolean;
  grantMode?: 'passive' | 'active';
  notes?: string;
}

/**
 * Shared Mongoose schema for GrantedAbilityRef.
 * Import and use this in any model that needs to reference granted abilities.
 */
export const GrantedAbilityRefSchema = new mongoose.Schema(
  {
    abilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AbilityDefinition',
      required: true,
    },
    abilityKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    requiresEquipped: {
      type: Boolean,
      default: true,
    },
    grantMode: {
      type: String,
      enum: ['passive', 'active'],
      default: 'active',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false }
);
