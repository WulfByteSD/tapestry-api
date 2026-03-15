import mongoose from 'mongoose';

export type CampaignStatus = 'active' | 'archived' | 'draft';
export type CampaignRole = 'sw' | 'co-sw' | 'player' | 'observer';

export type DiscordMode = 'none' | 'webhook' | 'bot';

export interface CampaignMember {
  player: mongoose.Schema.Types.ObjectId; // ref Player
  role: CampaignRole;
  joinedAt?: Date;
  nickname?: string; // campaign-specific display name (optional)
}

export interface CampaignInvite {
  code: string; // short invite code
  role: CampaignRole; // role granted on join
  expiresAt?: Date | null;
  usesRemaining?: number | null; // null = unlimited
  createdAt?: Date;
}

export interface DiscordConfig {
  mode: DiscordMode;

  // Webhook mode (MVP-friendly)
  webhookUrl?: string | null;

  // Bot mode (later)
  guildId?: string | null;
  channelId?: string | null;

  // Formatting / behavior
  postRolls?: boolean;
  postToThread?: boolean;
  messageStyle?: 'compact' | 'detailed';
}

export interface CampaignDisplayConfig {
  // Labels for UI (campaign-level so characters stay canonical)
  aspectFamilies: {
    might: string; // "Might"
    finesse: string; // "Finesse"
    wit: string; // "Wit"
    resolve: string; // "Resolve"
  };
  aspectSub: {
    strength: string; // "Strength"
    presence: string; // "Presence"
    agility: string; // "Agility"
    charm: string; // "Charm"
    instinct: string; // "Instinct"
    knowledge: string; // "Knowledge"
    willpower: string; // "Willpower"
    empathy: string; // "Empathy"
  };
}

export interface CampaignType extends mongoose.Document {
  name: string;
  status: CampaignStatus;

  owner: mongoose.Schema.Types.ObjectId; // ref Player (Storyweaver)
  members: CampaignMember[];

  // Optional setting context
  settingKey?: string; // e.g. "woven-realms"
  toneModules: string[]; // e.g. ["dragon-dial", "love-romance-dial"]
  avatar?: string | null; // optional campaign avatar image URL
  discoverable: boolean; // whether this campaign is discoverable in public listings
  // Enabled sources for content library
  // ex: ["core", "woven-realms", "hb:<campaignId>"]
  sources: string[];

  // Campaign-level display config (labels)
  display: CampaignDisplayConfig;

  // Discord roll routing config
  discord: DiscordConfig;

  // Optional invites
  invites: CampaignInvite[];

  // Meta
  rulesetVersion: number;
  notes?: string;
  maxPlayers: number; // 0 = unlimited
  tableExpectations?: string; // freeform text about play style, content, etc.
  joinPolicy: 'open' | 'approval' | 'invite-only';

  createdAt: Date;
  updatedAt: Date;
}

const CampaignMemberSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    role: { type: String, enum: ['sw', 'co-sw', 'player', 'observer'], default: 'player' },
    joinedAt: { type: Date, default: () => new Date() },
    nickname: { type: String, trim: true },
  },
  { _id: false }
);

const CampaignInviteSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    role: { type: String, enum: ['sw', 'co-sw', 'player', 'observer'], default: 'player' },
    expiresAt: { type: Date, default: null },
    usesRemaining: { type: Number, default: null, min: 0 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const CampaignDisplaySchema = new mongoose.Schema(
  {
    aspectFamilies: {
      might: { type: String, default: 'Might' },
      finesse: { type: String, default: 'Finesse' },
      wit: { type: String, default: 'Wit' },
      resolve: { type: String, default: 'Resolve' },
    },
    aspectSub: {
      strength: { type: String, default: 'Strength' },
      presence: { type: String, default: 'Presence' },
      agility: { type: String, default: 'Agility' },
      charm: { type: String, default: 'Charm' },
      instinct: { type: String, default: 'Instinct' },
      knowledge: { type: String, default: 'Knowledge' },
      willpower: { type: String, default: 'Willpower' },
      empathy: { type: String, default: 'Empathy' },
    },
  },
  { _id: false }
);

const DiscordConfigSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['none', 'webhook', 'bot'], default: 'none' },

    webhookUrl: { type: String, default: null },

    guildId: { type: String, default: null },
    channelId: { type: String, default: null },

    postRolls: { type: Boolean, default: true },
    postToThread: { type: Boolean, default: false },
    messageStyle: { type: String, enum: ['compact', 'detailed'], default: 'compact' },
  },
  { _id: false }
);

const CampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'archived', 'draft'], default: 'draft' },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    members: { type: [CampaignMemberSchema], default: [] },

    settingKey: { type: String, trim: true },
    toneModules: { type: [String], default: [] },
    avatar: { type: String, default: null }, // optional campaign avatar image URL
    sources: { type: [String], default: ['core'] },
    discoverable: { type: Boolean, default: false },
    display: { type: CampaignDisplaySchema, default: () => ({}) },

    discord: { type: DiscordConfigSchema, default: () => ({}) },

    invites: { type: [CampaignInviteSchema], default: [] },

    rulesetVersion: { type: Number, default: 1 },
    notes: { type: String, default: '' },
    maxPlayers: { type: Number, default: 0 },
    tableExpectations: { type: String, default: '' },
    joinPolicy: { type: String, enum: ['open', 'approval', 'invite-only'], default: 'invite-only' },
  },
  { timestamps: true }
);

// ---- Indexes ----

// Fast "my campaigns"
CampaignSchema.index({ owner: 1, status: 1, updatedAt: -1 });

// Fast membership queries (find campaigns a player is in)
CampaignSchema.index({ 'members.player': 1, status: 1 });

// Optional search by name
CampaignSchema.index({ name: 'text' });

// Invite code lookup (not unique globally unless you want it to be)
CampaignSchema.index({ 'invites.code': 1 });

export default mongoose.model<CampaignType>('Campaign', CampaignSchema);
