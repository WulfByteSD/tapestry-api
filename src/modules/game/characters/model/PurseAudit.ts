import mongoose from 'mongoose';
import type { PurseSnapshot } from '../helpers/characterPurse';

interface PurseAuditType extends mongoose.Document {
  character: mongoose.Types.ObjectId;
  dedupeKey: string;
  fingerprint: string;
  requestId: string;
  actor: { playerId: mongoose.Types.ObjectId; name: string };
  action: string;
  source: string;
  campaign?: mongoose.Types.ObjectId;
  campaignName?: string;
  note: string;
  before: PurseSnapshot;
  after: PurseSnapshot;
  revision: number;
  createdAt: Date;
}

const immutable = (type: any, required = true) => ({ type, required, immutable: true });
const PurseAuditSchema = new mongoose.Schema<PurseAuditType>({
  character: immutable(mongoose.Schema.Types.ObjectId),
  dedupeKey: immutable(String),
  fingerprint: immutable(String),
  requestId: immutable(String),
  actor: {
    playerId: immutable(mongoose.Schema.Types.ObjectId),
    name: immutable(String),
  },
  action: { ...immutable(String), enum: ['mark', 'clear', 'clear_all', 'set_base_capacity', 'capacity_changed', 'copy_origin'] },
  source: { ...immutable(String), enum: ['player', 'storyweaver', 'manual_weave', 'advance_weave', 'reset_weaves', 'character_copy'] },
  campaign: immutable(mongoose.Schema.Types.ObjectId, false),
  campaignName: immutable(String, false),
  note: { type: String, default: '', immutable: true },
  before: immutable(mongoose.Schema.Types.Mixed),
  after: immutable(mongoose.Schema.Types.Mixed),
  revision: immutable(Number),
}, { timestamps: { createdAt: true, updatedAt: false } });

PurseAuditSchema.index({ character: 1, dedupeKey: 1 }, { unique: true });
PurseAuditSchema.index({ character: 1, createdAt: -1, _id: -1 });
PurseAuditSchema.index({ character: 1, campaign: 1, createdAt: -1, _id: -1 });
PurseAuditSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Purse history is immutable.');
});
PurseAuditSchema.pre('deleteOne', { document: true, query: false }, function () { throw new Error('Purse history is immutable.'); });
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite']) {
  PurseAuditSchema.pre(operation as any, function () { throw new Error('Purse history is immutable.'); });
}

export default mongoose.model<PurseAuditType>('PurseAudit', PurseAuditSchema);
