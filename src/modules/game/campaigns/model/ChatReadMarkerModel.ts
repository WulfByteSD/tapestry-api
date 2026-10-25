import mongoose from 'mongoose';

export interface ChatReadMarkerDoc extends mongoose.Document {
  campaign: mongoose.Types.ObjectId;
  channel: mongoose.Types.ObjectId;
  player: mongoose.Types.ObjectId;
  lastReadMessage: mongoose.Types.ObjectId | null;
  updatedAt: Date;
}

const ChatReadMarkerSchema = new mongoose.Schema<ChatReadMarkerDoc>(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatChannel', required: true },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    lastReadMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
  },
  { timestamps: true }
);

ChatReadMarkerSchema.index({ channel: 1, player: 1 }, { unique: true });

export default mongoose.model<ChatReadMarkerDoc>('ChatReadMarker', ChatReadMarkerSchema);
