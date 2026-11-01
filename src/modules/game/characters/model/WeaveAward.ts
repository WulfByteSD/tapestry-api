import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  campaignName: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  actorName: { type: String, required: true },
  requestId: { type: String, required: true },
  fingerprint: { type: String, required: true },
  note: { type: String, default: '' },
  recipients: [{
    _id: false,
    character: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    status: { type: String, enum: ['pending', 'applied', 'handled_manually', 'dismissed'], default: 'pending' },
    resolvedAt: Date,
  }],
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ campaign: 1, actor: 1, requestId: 1 }, { unique: true });
schema.index({ 'recipients.character': 1, 'recipients.status': 1 });
export default mongoose.model('WeaveAward', schema);
