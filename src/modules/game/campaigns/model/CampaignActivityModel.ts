import mongoose from 'mongoose';

export type CampaignActivityType =
  | 'roll.attack'
  | 'roll.custom'
  | 'campaign.member_joined'
  | 'campaign.member_left'
  | 'campaign.character_attached'
  | 'campaign.character_detached'
  | 'sw.note';

export interface CampaignActivityDoc extends mongoose.Document {
  campaign: mongoose.Types.ObjectId;
  activityType: CampaignActivityType;
  actor: {
    player: mongoose.Types.ObjectId;
    playerNameSnapshot?: string;
    character?: mongoose.Types.ObjectId;
    characterNameSnapshot?: string;
  };
  payload: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignActivitySchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    activityType: {
      type: String,
      enum: ['roll.attack', 'roll.custom', 'campaign.member_joined', 'campaign.member_left', 'campaign.character_attached', 'campaign.character_detached', 'sw.note'],
      required: true,
    },
    actor: {
      player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
      playerNameSnapshot: { type: String, trim: true },
      character: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', default: null },
      characterNameSnapshot: { type: String, trim: true, default: null },
    },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

// Primary query index — descending feed per campaign
CampaignActivitySchema.index({ campaign: 1, _id: -1 });

// Filtered feed by type
CampaignActivitySchema.index({ campaign: 1, activityType: 1, _id: -1 });

export default mongoose.model<CampaignActivityDoc>('CampaignActivity', CampaignActivitySchema);
