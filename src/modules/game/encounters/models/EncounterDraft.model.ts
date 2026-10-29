import mongoose, { Schema } from 'mongoose';
import { participants, turnOrder } from '../utils/contracts';

const schema = new Schema(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, default: '', maxlength: 20000 },
    revision: { type: Number, default: 0, min: 0 },
    turnOrder: {
      type: Schema.Types.Mixed,
      default: undefined,
      validate: { validator: (value: unknown) => value === undefined || turnOrder.safeParse(value).success, message: 'Invalid encounter turn order.' },
    },
    participants: {
      type: [Schema.Types.Mixed],
      default: [],
      validate: { validator: (value: unknown) => participants.safeParse(value).success, message: 'Invalid encounter participants.' },
    },
  },
  { timestamps: true, collection: 'encounter_drafts' }
);
schema.index({ campaign: 1, updatedAt: -1, _id: -1 });
export const EncounterDraftModel = mongoose.model('EncounterDraft', schema);
