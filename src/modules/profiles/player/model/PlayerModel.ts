import mongoose from 'mongoose';

export interface PlayerType extends mongoose.Document {
  user: mongoose.Schema.Types.ObjectId;
  roles: ('player' | 'storyweaver')[];
  permissions: string[]; // for fine-grained ACL
  displayName?: string;
  avatar?: string;
  bio?: string;
  timezone?: string;
  preferences?: {
    theme?: string;
    notifications?: boolean;
  };
  // Optional: Future storyweaver-specific stats
  storyweaverStats?: {
    gamesRun?: number;
    activeCampaigns?: number;
    totalPlayers?: number;
  };
  storyweaverSettings?: {
    enabledAt?: Date;
    officialLoreOptIn?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const PlayerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roles: {
      type: [String],
      enum: ['player', 'storyweaver'],
      required: true,
      default: ['player'],
    },
    permissions: { type: [String], default: [] }, // for fine-grained ACL
    displayName: { type: String, trim: true },
    avatar: { type: String },
    bio: { type: String, maxlength: 500 },
    timezone: { type: String },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
      notifications: { type: Boolean, default: true },
    },
    storyweaverStats: {
      gamesRun: { type: Number, default: 0 },
      activeCampaigns: { type: Number, default: 0 },
      totalPlayers: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
PlayerSchema.index({ user: 1 }, { unique: true });
PlayerSchema.index({ roles: 1 });
PlayerSchema.index({ displayName: 1 });

export default mongoose.model<PlayerType>('Player', PlayerSchema);
