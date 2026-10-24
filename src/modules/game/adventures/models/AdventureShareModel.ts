import mongoose, { Schema } from 'mongoose';

export interface AdventureShareRecord {
  campaignId: string;
  adventureId: string;
  resourceId: string;
  sharedByPlayerId: string;
}
const shareSchema = new Schema<AdventureShareRecord>({
  campaignId: { type: String, required: true, immutable: true },
  adventureId: { type: String, required: true, immutable: true },
  resourceId: { type: String, required: true, immutable: true },
  sharedByPlayerId: { type: String, required: true, immutable: true },
}, { timestamps: true, strict: 'throw', collection: 'adventure_campaign_shares' });
shareSchema.index({ campaignId: 1, adventureId: 1, resourceId: 1 }, { unique: true });
export const AdventureShare = mongoose.model<AdventureShareRecord>('AdventureShare', shareSchema);
