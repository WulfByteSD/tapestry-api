import mongoose from 'mongoose';

// One bot-wide gate: conservative pacing also covers channel-specific limits.
// Mongo's unique _id and conditional lease updates coordinate every API worker.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  token: String,
  leaseUntil: { type: Date, required: true },
  cooldownUntil: { type: Date, required: true },
});

export default mongoose.model('DiscordDeliveryGate', schema);
