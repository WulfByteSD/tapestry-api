import mongoose from 'mongoose';

export type NoteCardKind = 'general' | 'npc' | 'quest' | 'location' | 'faction' | 'clue';

/**
 * Represents a note card in the character's journal.
 */
export interface NoteCard {
  id: string;
  title: string;
  body: string;
  kind: NoteCardKind;
  pinned?: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const NoteCardSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, default: 'Untitled Note' },
    body: { type: String, default: '' },
    kind: {
      type: String,
      enum: ['general', 'npc', 'quest', 'location', 'faction', 'clue'],
      default: 'general',
    },
    pinned: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);
