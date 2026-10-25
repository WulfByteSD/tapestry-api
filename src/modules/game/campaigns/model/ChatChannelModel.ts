import mongoose from 'mongoose';

export type ChatMode = 'ic' | 'ooc';
export type ChatVisibility = 'campaign' | 'private';

export interface ChatChannelDoc extends mongoose.Document {
  campaign: mongoose.Types.ObjectId;
  name: string;
  mode: ChatMode;
  visibility: ChatVisibility;
  defaultKey: ChatMode | null;
  participantPlayerIds: mongoose.Types.ObjectId[];
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChatChannelSchema = new mongoose.Schema<ChatChannelDoc>(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    mode: { type: String, enum: ['ic', 'ooc'], required: true },
    visibility: { type: String, enum: ['campaign', 'private'], required: true },
    defaultKey: { type: String, enum: ['ic', 'ooc'], default: null },
    participantPlayerIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }], default: [] },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ChatChannelSchema.index(
  { campaign: 1, defaultKey: 1 },
  { unique: true, partialFilterExpression: { defaultKey: { $type: 'string' } } }
);
ChatChannelSchema.index({ campaign: 1, visibility: 1, archived: 1 });

export default mongoose.model<ChatChannelDoc>('ChatChannel', ChatChannelSchema);
