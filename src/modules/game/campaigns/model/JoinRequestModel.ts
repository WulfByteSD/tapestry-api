import mongoose from 'mongoose';
import { CampaignRole } from './CampaignModel';

export type JoinRequestStatus = 'pending' | 'approved' | 'denied';

export interface JoinRequestType extends mongoose.Document {
  campaign: mongoose.Schema.Types.ObjectId; // ref Campaign
  player: mongoose.Schema.Types.ObjectId; // ref Player
  status: JoinRequestStatus;
  message?: string; // optional message from player explaining why they want to join
  preferredRole: CampaignRole; // role the player would like (storyweaver can override on approval)
  requestedAt: Date;
  respondedAt?: Date | null;
  respondedBy?: mongoose.Schema.Types.ObjectId | null; // ref Player (which storyweaver approved/denied)
  createdAt: Date;
  updatedAt: Date;
}

const JoinRequestSchema = new mongoose.Schema<JoinRequestType>(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, index: true },
    status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending', required: true },
    message: { type: String, trim: true, maxlength: 500 },
    preferredRole: { type: String, enum: ['sw', 'co-sw', 'player', 'observer'], default: 'player', required: true },
    requestedAt: { type: Date, default: () => new Date(), required: true },
    respondedAt: { type: Date, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound index for efficient lookups
JoinRequestSchema.index({ campaign: 1, player: 1, status: 1 });

// Unique constraint: one pending request per player per campaign
JoinRequestSchema.index(
  { campaign: 1, player: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
  }
);

// TTL index: auto-delete old requests after 30 days
JoinRequestSchema.index({ requestedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const JoinRequestModel = mongoose.model<JoinRequestType>('JoinRequest', JoinRequestSchema);

export default JoinRequestModel;
