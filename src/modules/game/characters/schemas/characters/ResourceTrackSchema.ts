import mongoose from 'mongoose';

/**
 * Represents a resource with current, max, and temporary values.
 * Used for HP, Threads, Resolve, etc.
 */
export interface ResourceTrack {
  current: number;
  max: number;
  temp?: number;
}

export const ResourceTrackSchema = new mongoose.Schema(
  {
    current: { type: Number, default: 0, min: 0 },
    max: { type: Number, default: 0, min: 0 },
    temp: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);
