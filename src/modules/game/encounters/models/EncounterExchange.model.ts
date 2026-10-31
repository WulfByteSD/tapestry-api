import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  campaign: { type: Schema.Types.ObjectId, required: true }, scene: { type: Schema.Types.ObjectId, required: true }, encounter: { type: Schema.Types.ObjectId, required: true },
  player: { type: String, required: true }, requestKey: { type: String, required: true }, requestHash: { type: String, required: true },
  mode: { type: String, required: true }, actorParticipantId: String, targetParticipantId: String,
  actorKind: String, targetKind: String, targetCharacterId: String, actorName: String, targetName: String, status: { type: String, enum: ['pending','resolved','cancelled'], required: true },
  outcome: { type: String, default: null }, targetNumber: Number,
  attack: Schema.Types.Mixed, defense: Schema.Types.Mixed, defenseRequestKey: String, defenseRequestHash: String,
}, { timestamps: true, collection: 'encounter_exchanges' });
schema.index({ scene: 1, player: 1, requestKey: 1 }, { unique: true });
schema.index({ scene: 1, _id: -1 });
export const EncounterExchangeModel = mongoose.model('EncounterExchange', schema);
export function exchangeDto(row: any) { return { id:String(row._id), sceneId:String(row.scene), encounterId:String(row.encounter), mode:row.mode, actorParticipantId:row.actorParticipantId, targetParticipantId:row.targetParticipantId, actorKind:row.actorKind, targetKind:row.targetKind, targetCharacterId:row.targetCharacterId, actorName:row.actorName, targetName:row.targetName, status:row.status, outcome:row.outcome, targetNumber:row.targetNumber, attack:row.attack, defense:row.defense, createdAt:row.createdAt, updatedAt:row.updatedAt }; }
