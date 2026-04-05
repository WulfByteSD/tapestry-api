import mongoose from 'mongoose';

export type CharacterRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CharacterRequestType extends mongoose.Document {
  campaign: mongoose.Schema.Types.ObjectId; // ref Campaign
  character: mongoose.Schema.Types.ObjectId; // ref Character
  player: mongoose.Schema.Types.ObjectId; // ref Player
  status: CharacterRequestStatus;
  message?: string;
  requestedAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: mongoose.Schema.Types.ObjectId | null; // ref Player (storyweaver who acted)
  createdAt: Date;
  updatedAt: Date;
}

const CharacterRequestSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    character: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    message: { type: String, trim: true },
    requestedAt: { type: Date, default: () => new Date() },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  },
  { timestamps: true }
);

// TTL index — auto-delete resolved requests after 30 days
CharacterRequestSchema.index({ resolvedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30, sparse: true });

// Unique index: only one pending request per (campaign, character) pair
CharacterRequestSchema.index(
  { campaign: 1, character: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'unique_pending_character_request',
  }
);

// Query indexes
CharacterRequestSchema.index({ campaign: 1, status: 1, requestedAt: -1 });
CharacterRequestSchema.index({ player: 1, requestedAt: -1 });

export default mongoose.model<CharacterRequestType>('CharacterRequest', CharacterRequestSchema);
