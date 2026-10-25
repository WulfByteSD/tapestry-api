import mongoose from 'mongoose';

const mappingSchema = new mongoose.Schema({
  chatChannelId: String,
  chatChannelName: String,
  discordChannelId: { type: String, required: true },
  discordChannelName: { type: String, required: true },
}, { _id: false });

// This is the sole authoritative integration record. Campaign.discord is legacy data.
const connectionSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  guildId: { type: String, required: true },
  guildName: { type: String, required: true },
  mappings: {
    ic: { type: mappingSchema, default: null },
    ooc: { type: mappingSchema, default: null },
    rolls: { type: mappingSchema, default: null },
  },
  destinationIds: { type: [String], default: undefined },
}, { timestamps: true });
// Discord channel IDs are globally unique. Omit the field for server-only connections.
connectionSchema.index({ destinationIds: 1 }, { unique: true, partialFilterExpression: { 'destinationIds.0': { $exists: true } } });

const authorizationSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, required: true },
  player: { type: mongoose.Schema.Types.ObjectId, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  discordUserId: { type: String, required: true },
  guilds: [{ _id: false, id: String, name: String }],
  expiresAt: { type: Date, required: true },
});
authorizationSchema.index({ campaign: 1, player: 1, user: 1 }, { unique: true });
authorizationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const stateSchema = new mongoose.Schema({
  digest: { type: String, required: true, unique: true },
  campaign: { type: mongoose.Schema.Types.ObjectId, required: true },
  player: { type: mongoose.Schema.Types.ObjectId, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  expiresAt: { type: Date, required: true },
});
stateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DiscordConnectionModel = mongoose.model('DiscordConnection', connectionSchema);
export const DiscordAuthorizationModel = mongoose.model('DiscordAuthorization', authorizationSchema);
export const DiscordStateModel = mongoose.model('DiscordOAuthState', stateSchema);
