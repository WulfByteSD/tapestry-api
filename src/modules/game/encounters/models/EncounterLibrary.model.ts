import mongoose, { Schema } from 'mongoose';
import { combatantSnapshot } from '../utils/contracts';

const schema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    revision: { type: Number, default: 0, min: 0 },
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
      validate: { validator: (value: unknown) => combatantSnapshot.safeParse(value).success, message: 'Invalid combatant snapshot.' },
    },
  },
  { timestamps: true, collection: 'encounter_library' }
);
schema.index({ owner: 1, updatedAt: -1, _id: -1 });
export const EncounterLibraryModel = mongoose.model('EncounterLibraryEntry', schema);
