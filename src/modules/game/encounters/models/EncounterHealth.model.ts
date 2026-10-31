import mongoose, { Schema } from 'mongoose';
const audit = new Schema({
  campaign: { type: Schema.Types.ObjectId, required: true, immutable: true }, encounter: { type: Schema.Types.ObjectId, required: true, immutable: true }, scene: { type: Schema.Types.ObjectId, required: true, immutable: true },
  character: { type: Schema.Types.ObjectId, default: null, immutable: true }, ownerPlayerId: { type: String, immutable: true }, participantId: { type: String, required: true, immutable: true },
  actorPlayerId: { type: String, required: true, immutable: true }, action: { type: String, required: true, immutable: true }, before: { type: Schema.Types.Mixed, immutable: true }, after: { type: Schema.Types.Mixed, immutable: true },
  notes: { type: String, immutable: true }, correctionOf: { type: String, immutable: true }, calculation: { type: Schema.Types.Mixed, immutable: true },
  sourceParticipantId: { type: String, immutable: true }, exchangeId: { type: String, immutable: true }, actorName: { type: String, immutable: true }, sourceLabel: { type: String, immutable: true }, sceneTitle: { type: String, immutable: true }, encounterTitle: { type: String, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'encounter_health_audits' });
audit.index({ character: 1, _id: -1 });
// Audit records have no update/delete API and deliberately no expiry index.
export const EncounterHealthAuditModel = mongoose.model('EncounterHealthAudit', audit);
const preview = new Schema({ token:String, actor:String, campaign:String, encounter:String, scene:String, participantId:String, character:String, expected:Schema.Types.Mixed, input:Schema.Types.Mixed, result:Schema.Types.Mixed, expiresAt:Date }, {collection:'encounter_health_previews'});
preview.index({ token:1 }, {unique:true});
preview.index({expiresAt:1}, {expireAfterSeconds:0});
export const EncounterHealthPreviewModel = mongoose.model('EncounterHealthPreview', preview);
const receipt = new Schema({ actor:String, scene:String, requestKey:String, token:String, audit:Schema.Types.ObjectId }, {collection:'encounter_health_receipts'});
receipt.index({ actor:1, scene:1, requestKey:1 }, {unique:true});
receipt.index({ token:1 }, {unique:true});
export const EncounterHealthReceiptModel = mongoose.model('EncounterHealthReceipt', receipt);

