import { randomUUID } from 'crypto';
import { ClientSession } from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import CharacterModel from '../../characters/model/CharacterModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import calculateCharacterProtection from '../../rules/combat/calculateCharacterProtection';
import { EncounterDraftModel } from '../models/EncounterDraft.model';
import { EncounterSceneModel } from '../models/EncounterScene.model';
import { EncounterExchangeModel } from '../models/EncounterExchange.model';
import { EncounterHealthAuditModel, EncounterHealthPreviewModel, EncounterHealthReceiptModel } from '../models/EncounterHealth.model';
import { eligibleCharacter, sceneContext, sceneVisible, sid } from '../utils/sceneAccess';
import { sceneTransaction } from '../utils/sceneTransaction';
import { publishScene, requireOpen } from './EncounterScene.handler';
import { objectId, parse } from '../utils/contracts';

const copy=(v:any)=>JSON.parse(JSON.stringify(v));
export function calculateSceneHealth(before:any,input:any,protection:number) {
  const after=copy(before), incomingHarm=input.action==='harm'?input.amount:0;
  const effectiveHarm=Math.max(0,incomingHarm-protection);
  const tempAbsorbed=Math.min(after.hp.temp??0,effectiveHarm);
  if(input.action==='harm'){after.hp.temp=(after.hp.temp??0)-tempAbsorbed;after.hp.current=Math.max(0,after.hp.current-effectiveHarm+tempAbsorbed);}
  if(input.action==='heal')after.hp.current=Math.min(after.hp.max,after.hp.current+input.amount);
  if(input.action==='set_hp')after.hp.current=Math.min(after.hp.max,Math.max(0,input.amount));
  if(input.condition&&(input.action==='add_condition'||input.action==='harm')) {
    if(after.conditions.some((c:any)=>c.key===input.condition.key))throw new ErrorUtil('This condition is already present. Remove it before adding a replacement.',409);
    after.conditions.push({key:input.condition.key,notes:input.condition.notes??'',stacks:1,appliedAt:new Date().toISOString(),expiresAt:null});
  }
  if(input.action==='remove_condition')after.conditions=after.conditions.filter((c:any)=>c.key!==input.condition.key);
  return {before:copy(before),after,protection,incomingHarm,effectiveHarm,tempAbsorbed,fullyBlocked:incomingHarm>0&&incomingHarm<=protection,suggestsCondition:incomingHarm>0&&incomingHarm<=protection&&!input.condition};
}
export default class EncounterHealthHandler {
  private async target(campaign:any,encounter:any,scene:any,pid:string,session?:ClientSession) {
    const participant=encounter.participants.find((p:any)=>p.id===pid&&scene.participantIds.includes(p.id));
    if(!participant)throw new ErrorUtil('Health target is not in this scene.',404);
    if(participant.kind==='character'){
      const character=await eligibleCharacter(campaign,participant.provenance.id,session);if(!character)throw new ErrorUtil('Character is no longer an active campaign character.',409);
      return {participant,character,state:copy({hp:character.sheet.resources.hp,conditions:character.sheet.conditions}),protection:calculateCharacterProtection(character),version:character.__v??0};
    }
    const state=copy(encounter.runtime?.[pid]??{hp:{current:participant.snapshot.statline.hp,max:participant.snapshot.statline.hp,temp:0},conditions:[]});
    return {participant,character:null,state,protection:participant.snapshot.statline.armor,version:encounter.revision};
  }
  async preview(player:string,c:string,e:string,s:string,input:any) {
    const {campaign,encounter,scene}=await sceneContext(player,c,e,s,true,true);requireOpen(scene);
    const target=await this.target(campaign,encounter,scene,input.participantId);
    if(input.sourceParticipantId&&!scene.participantIds.includes(input.sourceParticipantId))throw new ErrorUtil('The source must be in this scene.',400);
    if(input.exchangeId&&!await EncounterExchangeModel.exists({_id:input.exchangeId,scene:s,encounter:e}))throw new ErrorUtil('Exchange not found in this scene.',400);
    if(input.correctionOf&&!await EncounterHealthAuditModel.exists({_id:input.correctionOf,participantId:input.participantId,encounter:e}))throw new ErrorUtil('Correction must reference an audit for this participant.',400);
    const result=calculateSceneHealth(target.state,input,target.protection),token=randomUUID(),expiresAt=new Date(Date.now()+5*60*1000);
    await EncounterHealthPreviewModel.create({token,actor:player,campaign:c,encounter:e,scene:s,participantId:input.participantId,character:target.character?sid(target.character._id):null,expected:{version:target.version,state:target.state,protection:target.protection,sceneRevision:scene.revision},input,result,expiresAt});
    return {...result,token,participantId:input.participantId,expiresAt};
  }
  private auditDto(row:any,accessible=true){return {id:sid(row._id),characterId:row.character?sid(row.character):undefined,participantId:row.participantId,action:row.action,before:row.before,after:row.after,notes:accessible?row.notes:undefined,correctionOf:row.correctionOf,actorPlayerId:row.actorPlayerId,actorName:row.actorName,calculation:row.calculation,...(accessible?{sceneId:sid(row.scene),encounterId:sid(row.encounter),sceneTitle:row.sceneTitle,encounterTitle:row.encounterTitle,sourceLabel:row.sourceLabel,exchangeId:row.exchangeId}:{}),createdAt:row.createdAt};}
  async apply(player:string,c:string,e:string,s:string,input:any) {
    // Validate current access even on idempotent replay.
    await sceneContext(player,c,e,s,true,true);
    const prior=await EncounterHealthReceiptModel.findOne({actor:player,scene:s,requestKey:input.requestKey}).lean();
    if(prior){if(prior.token!==input.token)throw new ErrorUtil('Request key was already used for another action.',409);return this.auditDto(await EncounterHealthAuditModel.findById(prior.audit).lean());}
    let auditId:string;
    try {auditId=await sceneTransaction(async session=>{
      const {campaign,encounter,scene}=await sceneContext(player,c,e,s,true,true,session);requireOpen(scene);
      const receipt=await EncounterHealthReceiptModel.findOne({actor:player,scene:s,requestKey:input.requestKey}).session(session).lean();
      if(receipt){if(receipt.token!==input.token)throw new ErrorUtil('Request key was already used for another action.',409);return sid(receipt.audit);}
      const preview:any=await EncounterHealthPreviewModel.findOne({token:input.token,actor:player,campaign:c,encounter:e,scene:s,expiresAt:{$gt:new Date()}}).session(session).lean();
      if(!preview)throw new ErrorUtil('Preview expired. Preview this action again.',409);
      const target=await this.target(campaign,encounter,scene,preview.participantId,session);
      if(target.version!==preview.expected.version||scene.revision!==preview.expected.sceneRevision||target.protection!==preview.expected.protection||JSON.stringify(target.state)!==JSON.stringify(preview.expected.state))throw new ErrorUtil('Health or scene state changed. Preview this action again.',409);
      if(preview.result.fullyBlocked&&!preview.input.condition&&!preview.input.allowBlockedWithoutCondition)throw new ErrorUtil('Fully blocked harm suggests a condition. Add a condition or explicitly acknowledge applying no effect.',400);
      const lock=await EncounterSceneModel.updateOne({_id:s,revision:scene.revision,status:'open'},{$inc:{revision:1}},{session});if(!lock.modifiedCount)throw new ErrorUtil('Scene changed. Preview again.',409);
      if(target.character){const result=await CharacterModel.updateOne({_id:target.character._id,__v:target.version,'sheet.resources.hp.current':target.character.sheet.resources.hp.current,'sheet.resources.hp.max':target.character.sheet.resources.hp.max,'sheet.resources.hp.temp':target.character.sheet.resources.hp.temp,updatedAt:target.character.updatedAt},{$set:{'sheet.resources.hp':preview.result.after.hp,'sheet.conditions':preview.result.after.conditions},$inc:{__v:1}},{session,runValidators:true});if(!result.modifiedCount)throw new ErrorUtil('Character changed. Preview again.',409);}
      else {const result=await EncounterDraftModel.updateOne({_id:e,revision:target.version},{$set:{[`runtime.${preview.participantId}`]:preview.result.after},$inc:{revision:1}},{session});if(!result.modifiedCount)throw new ErrorUtil('Encounter changed. Preview again.',409);}
      const actor=await PlayerModel.findById(player).select('displayName').session(session).lean();
      const source=encounter.participants.find((p:any)=>p.id===preview.input.sourceParticipantId);
      const [audit]=await EncounterHealthAuditModel.create([{campaign:c,encounter:e,scene:s,character:target.character?target.character._id:null,ownerPlayerId:target.character?sid(target.character.player):undefined,participantId:preview.participantId,actorPlayerId:player,actorName:actor?.displayName??'Storyweaver',sceneTitle:scene.title,encounterTitle:encounter.title,sourceParticipantId:preview.input.sourceParticipantId,exchangeId:preview.input.exchangeId,sourceLabel:source?.snapshot.name,action:preview.input.action,before:preview.result.before,after:preview.result.after,notes:preview.input.notes,correctionOf:preview.input.correctionOf,calculation:{protection:preview.result.protection,incomingHarm:preview.result.incomingHarm,effectiveHarm:preview.result.effectiveHarm,tempAbsorbed:preview.result.tempAbsorbed,allowBlockedWithoutCondition:!!preview.input.allowBlockedWithoutCondition}}],{session});
      await EncounterHealthReceiptModel.create([{actor:player,scene:s,requestKey:input.requestKey,token:input.token,audit:audit._id}],{session});return sid(audit._id);
    });}catch(error:any){if(error?.code===11000){const receipt=await EncounterHealthReceiptModel.findOne({actor:player,scene:s,requestKey:input.requestKey,token:input.token}).lean();if(receipt)auditId=sid(receipt.audit);else throw new ErrorUtil('This preview has already been applied.',409);}else throw error;}
    await publishScene(s);return this.auditDto(await EncounterHealthAuditModel.findById(auditId!).lean());
  }
  async history(player:string,characterId:string,cursor?:string) {
    parse(objectId,characterId);if(cursor)parse(objectId,cursor);
    const character=await CharacterModel.findById(characterId).lean();if(!character)throw new ErrorUtil('Character not found.',404);
    const owner=sid(character.player)===player;
    let campaign:any;
    if(!owner){if(!character.campaign)throw new ErrorUtil('Character health history is private.',403);campaign=(await sceneContext(player,sid(character.campaign),undefined,undefined,true)).campaign;}
    const rows=await EncounterHealthAuditModel.find({character:characterId,...(!owner?{campaign:campaign._id}:{}),...(cursor?{_id:{$lt:cursor}}:{})}).sort({_id:-1}).limit(51).lean();
    const items=[];
    for(const row of rows.slice(0,50)){
      let access=false,sourceVisible=false;
      try{
        const ctx=await sceneContext(player,sid(row.campaign));const scene=await EncounterSceneModel.findById(row.scene).lean();
        access=!!scene&&sceneVisible(scene,ctx.campaign,player);
        if(access&&scene){const encounter=await EncounterDraftModel.findById(row.encounter).lean();const source=encounter?.participants.find((p:any)=>p.id===row.sourceParticipantId);sourceVisible=ctx.manager||source?.kind==='character'||scene.revealedParticipantIds.includes(row.sourceParticipantId??'');}
      }catch{}
      const dto=this.auditDto(row,access);if(!sourceVisible)delete dto.sourceLabel;items.push(dto);
    }
    return {items,nextCursor:rows.length>50?sid(rows[49]._id):null};
  }
}




