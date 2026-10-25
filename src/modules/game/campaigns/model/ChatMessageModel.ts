import mongoose from 'mongoose';

export type ChatSpeakerType = 'profile' | 'character' | 'narrator';

export interface ChatMessageDoc extends mongoose.Document {
  campaign: mongoose.Types.ObjectId;
  channel: mongoose.Types.ObjectId;
  clientMessageId: string;
  origin: 'web';
  author: {
    player: mongoose.Types.ObjectId;
    displayName: string;
    avatar: string | null;
  };
  speaker: {
    type: ChatSpeakerType;
    character?: mongoose.Types.ObjectId | null;
    characterName?: string | null;
    avatar?: string | null;
  };
  content: string;
  replyTo?: mongoose.Types.ObjectId | null;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new mongoose.Schema<ChatMessageDoc>(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatChannel', required: true },
    clientMessageId: { type: String, required: true, trim: true, maxlength: 128 },
    origin: { type: String, enum: ['web'], default: 'web', required: true },
    author: {
      player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
      displayName: { type: String, required: true, maxlength: 80 },
      avatar: { type: String, default: null },
    },
    speaker: {
      type: { type: String, enum: ['profile', 'character', 'narrator'], required: true },
      character: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', default: null },
      characterName: { type: String, default: null, maxlength: 80 },
      avatar: { type: String },
    },
    content: { type: String, required: function (this: any) { return !this.deletedAt; }, maxlength: 8000 },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ channel: 1, _id: -1 });
ChatMessageSchema.index({ channel: 1, 'author.player': 1, clientMessageId: 1 }, { unique: true });

export default mongoose.model<ChatMessageDoc>('ChatMessage', ChatMessageSchema);
