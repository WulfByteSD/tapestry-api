import mongoose from 'mongoose';

export type ChatSpeakerType = 'profile' | 'character' | 'narrator' | 'combatant';
export type ChatComposition = { action: string; dialogue: string; parts?: never } | { parts: { type: 'action' | 'dialogue'; text: string }[]; action?: never; dialogue?: never };

export interface ChatMessageDoc extends mongoose.Document {
  systemEntry?: { type: 'encounter_exchange'; exchangeId: mongoose.Types.ObjectId };
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
    participantId?: string | null;
    characterName?: string | null;
    avatar?: string | null;
  };
  content: string;
  composition?: ChatComposition;
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
    systemEntry: { type: new mongoose.Schema({ type: { type: String, enum: ['encounter_exchange'], required: true }, exchangeId: { type: mongoose.Schema.Types.ObjectId, required: true } }, { _id: false }), default: undefined },
    clientMessageId: { type: String, required: true, trim: true, maxlength: 128 },
    origin: { type: String, enum: ['web'], default: 'web', required: true },
    author: {
      player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
      displayName: { type: String, required: true, maxlength: 80 },
      avatar: { type: String, default: null },
    },
    speaker: {
      type: { type: String, enum: ['profile', 'character', 'narrator', 'combatant'], required: true },
      participantId: { type: String, default: null },
      character: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', default: null },
      characterName: { type: String, default: null, maxlength: 240 },
      avatar: { type: String },
    },
    content: { type: String, required: function (this: any) { return !this.deletedAt; }, maxlength: 8000 },
    composition: { type: new mongoose.Schema({
      action: { type: String, maxlength: 8000 },
      dialogue: { type: String, maxlength: 8000 },
      parts: { type: [new mongoose.Schema({ type: { type: String, enum: ['action', 'dialogue'], required: true }, text: { type: String, required: true, maxlength: 8000 } }, { _id: false })], default: undefined },
    }, { _id: false }), default: undefined },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ channel: 1, _id: -1 });
ChatMessageSchema.index({ channel: 1, 'author.player': 1, clientMessageId: 1 }, { unique: true });

export default mongoose.model<ChatMessageDoc>('ChatMessage', ChatMessageSchema);
