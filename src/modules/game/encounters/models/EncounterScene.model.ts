import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  campaign: { type: Schema.Types.ObjectId, required: true, index: true },
  encounter: { type: Schema.Types.ObjectId, required: true, index: true },
  title: { type: String, required: true, maxlength: 80 },
  status: { type: String, enum: ['draft', 'open', 'completed'], default: 'draft' },
  published: { type: Boolean, default: false },
  createdChannel: { type: Boolean, default: false },
  visibility: { type: String, enum: ['campaign', 'private'], required: true },
  mode: { type: String, enum: ['defense_tn', 'opposed'], required: true },
  channel: { type: Schema.Types.ObjectId, default: null },
  audiencePlayerIds: { type: [String], default: [] },
  participantIds: { type: [String], default: [] },
  revealedParticipantIds: { type: [String], default: [] },
  turnOrder: { type: Schema.Types.Mixed, required: true },
  revision: { type: Number, default: 0 },
}, { timestamps: true, collection: 'encounter_scenes' });
schema.index({ channel: 1 }, { unique: true, partialFilterExpression: { channel: { $type: 'objectId' } } });
export const EncounterSceneModel = mongoose.model('EncounterScene', schema);

