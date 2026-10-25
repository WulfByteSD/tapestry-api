import mongoose from 'mongoose';

// Only a verified identity is retained; OAuth credentials never reach storage.
const accountSchema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, unique: true },
  discordUserId: { type: String, required: true, unique: true },
  verifiedAt: { type: Date, required: true },
}, { timestamps: true });

const stateSchema = new mongoose.Schema({
  digest: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ['account'], required: true },
  campaign: { type: mongoose.Schema.Types.ObjectId, required: true },
  player: { type: mongoose.Schema.Types.ObjectId, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  expiresAt: { type: Date, required: true },
});
stateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DiscordAccountModel = mongoose.model('DiscordAccount', accountSchema);
export const DiscordAccountStateModel = mongoose.model('DiscordAccountOAuthState', stateSchema);
