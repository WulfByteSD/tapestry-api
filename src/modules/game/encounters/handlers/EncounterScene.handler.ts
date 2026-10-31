import { ClientSession } from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { EncounterSceneModel } from '../models/EncounterScene.model';
import { EncounterDraftModel } from '../models/EncounterDraft.model';
import { EncounterExchangeModel } from '../models/EncounterExchange.model';
import CampaignModel from '../../campaigns/model/CampaignModel';
import ChatChannelModel from '../../campaigns/model/ChatChannelModel';
import { emitChatToPlayers } from '../../campaigns/chat/chatEvents';
import { eligibleCharacter, isManager, role, sceneContext, sceneVisible, sid } from '../utils/sceneAccess';
import { sceneTransaction } from '../utils/sceneTransaction';
import EncounterTurnOrderHandler from './EncounterTurnOrder.handler';
import { participantNames } from '../utils/participantNames';
import { sceneCharacterDefense } from '../utils/sceneCharacterDefense';
const turns=new EncounterTurnOrderHandler();
export const requireOpen=(scene:any)=>{if(scene.status!=='open')throw new ErrorUtil('Open this scene before taking actions.',409);};
export const checkRevision=(scene:any,revision:number)=>{if(scene.revision!==revision)throw new ErrorUtil('This scene changed. Reload before saving.',409);};

export async function publishScene(sceneId:string,event='encounter:sceneUpdated') {
  const scene:any=await EncounterSceneModel.findById(sceneId).lean(); if(!scene)return;
  const campaign:any=await CampaignModel.findById(scene.campaign).lean(); if(!campaign)return;
  const players=[...new Set<string>([sid(campaign.owner),...campaign.members.map((m:any)=>sid(m.player))])].filter(p=>sceneVisible(scene,campaign,p));
  // Invalidation-only payloads avoid accidentally reusing a Storyweaver DTO for players.
  emitChatToPlayers(players,event,{campaignId:sid(scene.campaign),encounterId:sid(scene.encounter),sceneId,channelId:scene.channel?sid(scene.channel):null});
  if(scene.channel)emitChatToPlayers(players,'chat:channel:updated',{campaignId:sid(scene.campaign),channelId:sid(scene.channel)});
}
export default class EncounterSceneHandler {
  async dto(scene:any,campaign:any,encounter:any,player:string,summary=false) {
    const manager=isManager(campaign,player), participants:any[]=[],playableCharacterIds:string[]=[];
    const names=participantNames(manager?encounter.participants:encounter.participants.filter((p:any)=>scene.participantIds.includes(p.id)&&(p.kind==='character'||scene.revealedParticipantIds.includes(p.id))));
    for(const participant of encounter.participants.filter((p:any)=>scene.participantIds.includes(p.id))) {
      if(participant.kind==='character') {
        const character=await eligibleCharacter(campaign,participant.provenance.id);
        if(!character)continue;
        if(sid(character.player)===player && role(campaign,player)!=='observer')playableCharacterIds.push(sid(character._id));
        participants.push({id:participant.id,kind:'character',name:character.name,portraitUrl:character.avatarUrl,characterId:sid(character._id),ownerPlayerId:sid(character.player),defenseTN:sceneCharacterDefense(character),revealed:true,...(manager?{snapshot:participant.snapshot,health:{hp:character.sheet.resources.hp,conditions:character.sheet.conditions}}:{})});
      } else if(manager || scene.revealedParticipantIds.includes(participant.id)) {
        participants.push({id:participant.id,kind:'combatant',name:names.get(participant.id),portraitUrl:participant.snapshot.media?.portraitUrl,defenseTN:participant.snapshot.statline.defenseTN,revealed:scene.revealedParticipantIds.includes(participant.id),...(manager?{snapshot:participant.snapshot,health:encounter.runtime?.[participant.id]??{hp:{current:participant.snapshot.statline.hp,max:participant.snapshot.statline.hp,temp:0},conditions:[]}}:{})});
      }
    }
    const result={id:sid(scene._id),encounterId:sid(encounter._id),campaignId:sid(campaign._id),encounterTitle:encounter.title,title:scene.title,status:scene.status,visibility:scene.visibility,channelId:scene.channel?sid(scene.channel):null,mode:scene.mode,canManage:manager,canPost:scene.status==='open'&&campaign.status!=='archived'&&(manager||playableCharacterIds.length>0),playableCharacterIds};
    if(summary)return result;
    const visibleIds=new Set(participants.map(p=>p.id));
    return {...result,revision:scene.revision,encounterStatus:encounter.status??'draft',audiencePlayerIds:manager?scene.audiencePlayerIds:[],participants,turnOrder:{...scene.turnOrder,slots:scene.turnOrder.slots.filter((s:any)=>visibleIds.has(s.participantId)),currentSlotId:scene.turnOrder.slots.some((s:any)=>s.id===scene.turnOrder.currentSlotId&&visibleIds.has(s.participantId))?scene.turnOrder.currentSlotId:null},createdAt:scene.createdAt,updatedAt:scene.updatedAt};
  }
  async list(player:string,c:string,e?:string) {
    const {campaign}=await sceneContext(player,c,e);
    const scenes=await EncounterSceneModel.find({campaign:c,...(e?{encounter:e}:{})}).sort({createdAt:1}).lean();
    const result:any[]=[];
    for(const scene of scenes)if(sceneVisible(scene,campaign,player)){const encounter=await EncounterDraftModel.findById(scene.encounter).lean();if(encounter)result.push(await this.dto(scene,campaign,encounter,player,true));}
    return result;
  }
  async get(player:string,c:string,e:string,s:string){const ctx=await sceneContext(player,c,e,s);return this.dto(ctx.scene,ctx.campaign,ctx.encounter,player);}
  private async cast(campaign:any,encounter:any,ids:string[],audience:string[],session?:ClientSession,excludeSceneIds:string[]=[]) {
    const members=new Set([sid(campaign.owner),...campaign.members.map((m:any)=>sid(m.player))]);
    if(audience.some(p=>!members.has(p)))throw new ErrorUtil('Audience members must belong to this campaign.',400);
    if(await EncounterSceneModel.exists({encounter:encounter._id,status:{$ne:'completed'},participantIds:{$in:ids},_id:{$nin:excludeSceneIds}}).session(session??null))throw new ErrorUtil('A cast participant already belongs to another unfinished scene in this encounter. Use Transfer participants to move them.',409);
    const owners:string[]=[];
    for(const pid of ids){const p=encounter.participants.find((p:any)=>p.id===pid);if(!p)throw new ErrorUtil('Cast participant is not in this encounter.',400);if(p.kind==='character'){const character=await eligibleCharacter(campaign,p.provenance.id,session);if(!character)throw new ErrorUtil('Cast characters must be active characters attached to current campaign members.',400);owners.push(sid(character.player));}}
    return [...new Set([...audience,...owners])];
  }
  private async overlaps(encounter:any,ids:string[]) {
    const characters=encounter.participants.filter((p:any)=>p.kind==='character'&&ids.includes(p.id));
    const others:any[]=await EncounterDraftModel.find({_id:{$ne:encounter._id},status:'active','participants.provenance.id':{$in:characters.map((p:any)=>p.provenance.id)}}).lean();
    return others.flatMap(other=>characters.filter((p:any)=>other.participants.some((o:any)=>o.kind==='character'&&o.provenance.id===p.provenance.id)).map((p:any)=>({characterId:p.provenance.id,characterName:p.snapshot.name,...(sid(other.campaign)===sid(encounter.campaign)?{encounterId:sid(other._id),encounterTitle:other.title}:{encounterTitle:'Another active encounter'})})));
  }
  async create(player:string,c:string,e:string,input:any) {
    const ctx=await sceneContext(player,c,e,undefined,true,true);
    const overlaps=await this.overlaps(ctx.encounter,input.participantIds);
    if(overlaps.length&&!input.confirmOverlap)return {requiresConfirmation:true,overlaps};
    const sceneId=await sceneTransaction(async session=>{
      const {campaign,encounter}=await sceneContext(player,c,e,undefined,true,true,session);
      if((campaign.playSurface==='discord')!==(input.channel.kind==='standalone'))throw new ErrorUtil('Discord tables use standalone scenes; Tapestry tables link an IC channel.',400);
      const lock=await EncounterDraftModel.updateOne({_id:e,revision:encounter.revision},{$inc:{revision:1}},{session});if(!lock.modifiedCount)throw new ErrorUtil('Encounter changed. Reload before creating a scene.',409);
      let audience=await this.cast(campaign,encounter,input.participantIds,input.audiencePlayerIds??[],session), channel:any=null;
      if(input.channel.kind==='existing') {
        channel=await ChatChannelModel.findOne({_id:input.channel.channelId,campaign:c,mode:'ic',archived:false}).session(session);
        if(!channel || channel.visibility!==input.visibility)throw new ErrorUtil('Choose an active IC channel with matching visibility.',400);
        if(await EncounterSceneModel.exists({channel:channel._id}).session(session))throw new ErrorUtil('This channel already belongs to a scene.',409);
        // Existing visibility and history survive linking; retain existing private readers.
        audience=[...new Set([...audience,...channel.participantPlayerIds.map(sid)])];
      } else if(input.channel.kind==='new') {
        [channel]=await ChatChannelModel.create([{campaign:c,name:input.title,mode:'ic',visibility:input.visibility,participantPlayerIds:[]}],{session});
      }
      // Linking is preparation: existing readers retain access, while new audience grants wait for Open.
      const [scene]=await EncounterSceneModel.create([{campaign:c,encounter:e,title:input.title,mode:input.mode,visibility:input.visibility,channel:channel?channel._id:null,createdChannel:input.channel.kind==='new',audiencePlayerIds:audience,participantIds:input.participantIds,turnOrder:{round:1,slots:input.participantIds.map((id:string)=>({id,participantId:id})),currentSlotId:null}}],{session});
      return sid(scene._id);
    });
    await publishScene(sceneId);return {requiresConfirmation:false,scene:await this.get(player,c,e,sceneId)};
  }
  async update(player:string,c:string,e:string,s:string,input:any) {
    const ctx=await sceneContext(player,c,e,s,true,true);checkRevision(ctx.scene,input.revision);
    const ids=input.participantIds??ctx.scene.participantIds;
    const overlaps=await this.overlaps(ctx.encounter,ids);if(overlaps.length&&!input.confirmOverlap)return {requiresConfirmation:true,overlaps};
    await sceneTransaction(async session=>{
      const {campaign,encounter,scene}=await sceneContext(player,c,e,s,true,true,session);checkRevision(scene,input.revision);
      if(scene.status==='completed')throw new ErrorUtil('Reopen the scene before editing it.',409);
      const lock=await EncounterDraftModel.updateOne({_id:e,revision:encounter.revision},{$inc:{revision:1}},{session});if(!lock.modifiedCount)throw new ErrorUtil('Encounter changed. Reload before updating a scene.',409);
      const audience=await this.cast(campaign,encounter,ids,input.audiencePlayerIds??scene.audiencePlayerIds,session,[s]);
      if(input.audiencePlayerIds && audience.some(p=>scene.audiencePlayerIds.includes(p)&&!input.audiencePlayerIds.includes(p)))throw new ErrorUtil('Remove an owner’s characters from the cast before removing their audience access.',400);
      const revealed=input.revealedParticipantIds??scene.revealedParticipantIds.filter((id:string)=>ids.includes(id));
      if(revealed.some((id:string)=>!ids.includes(id)||!encounter.participants.some((p:any)=>p.id===id&&p.kind==='combatant')))throw new ErrorUtil('Only NPCs in this scene can be revealed.',400);
      const departed=scene.participantIds.filter((id:string)=>!ids.includes(id));
      let order=turns.remove(scene.turnOrder,new Set(scene.turnOrder.slots.filter((slot:any)=>departed.includes(slot.participantId)).map((slot:any)=>slot.id)));
      for(const id of ids.filter((id:string)=>!scene.participantIds.includes(id)))order=turns.append(order,id);
      const saved=await EncounterSceneModel.updateOne({_id:s,revision:input.revision,status:scene.status},{$set:{title:input.title??scene.title,mode:input.mode??scene.mode,participantIds:ids,audiencePlayerIds:audience,revealedParticipantIds:revealed,turnOrder:order},$inc:{revision:1}},{session});if(!saved.modifiedCount)throw new ErrorUtil('Scene changed. Reload before saving.',409);
      if(scene.channel&&scene.status!=='draft'&&scene.published!==false)await ChatChannelModel.updateOne({_id:scene.channel},{$set:{participantPlayerIds:scene.visibility==='private'?audience:[]}},{session});
      await this.cancelDepartures(s,departed,session);
    });
    const current=await EncounterSceneModel.findById(s).lean();
    const removed=ctx.scene.visibility==='private'?ctx.scene.audiencePlayerIds.filter((p:string)=>!current?.audiencePlayerIds.includes(p)):[];
    if(removed.length)emitChatToPlayers(removed,'chat:access:changed',{campaignId:c,channelIds:[],reason:'scene_audience_removed'});
    await publishScene(s);return {requiresConfirmation:false,scene:await this.get(player,c,e,s)};
  }
  private async cancelDepartures(scene:string,ids:string[],session:ClientSession){await EncounterExchangeModel.updateMany({scene,status:'pending',$or:[{actorParticipantId:{$in:ids}},{targetParticipantId:{$in:ids}}]},{$set:{status:'cancelled'}},{session});}
  async lifecycle(player:string,c:string,e:string,s:string,input:any) {
    const ctx=await sceneContext(player,c,e,s,true,true);checkRevision(ctx.scene,input.revision);
    const previousChannel=ctx.scene.channel?await ChatChannelModel.findById(ctx.scene.channel).select('participantPlayerIds').lean():null;
    if(input.action!=='complete'){const overlaps=await this.overlaps(ctx.encounter,ctx.scene.participantIds);if(overlaps.length&&!input.confirmOverlap)return {requiresConfirmation:true,overlaps};}
    await sceneTransaction(async session=>{
      const {campaign,encounter,scene}=await sceneContext(player,c,e,s,true,true,session);checkRevision(scene,input.revision);
      if(input.action==='open'&&scene.status!=='draft'||input.action==='reopen'&&scene.status!=='completed'||input.action==='complete'&&scene.status==='completed')throw new ErrorUtil('This scene lifecycle action is no longer available.',409);
      if(input.action!=='complete')await this.cast(campaign,encounter,scene.participantIds,scene.audiencePlayerIds,session,[s]);
      const saved=await EncounterSceneModel.updateOne({_id:s,revision:input.revision,status:scene.status},{$set:{status:input.action==='complete'?'completed':'open',...(input.action!=='complete'?{published:true}:{})},$inc:{revision:1}},{session});if(!saved.modifiedCount)throw new ErrorUtil('Scene changed. Reload before saving.',409);
      if(scene.channel)await ChatChannelModel.updateOne({_id:scene.channel},{$set:{archived:input.action==='complete',...(input.action!=='complete'&&scene.visibility==='private'?{participantPlayerIds:scene.audiencePlayerIds}:{})}},{session});
      if(input.action!=='complete')await EncounterDraftModel.updateOne({_id:e},{$set:{status:'active'},$inc:{revision:1}},{session});
      else await EncounterExchangeModel.updateMany({scene:s,status:'pending'},{$set:{status:'cancelled'}},{session});
    });
    if(input.action!=='complete'&&ctx.scene.visibility==='private'){
      const removed=previousChannel?.participantPlayerIds.map(sid).filter(p=>!ctx.scene.audiencePlayerIds.includes(p))??[];
      if(removed.length)emitChatToPlayers(removed,'chat:access:changed',{campaignId:c,channelIds:[],reason:'scene_audience_removed'});
    }
    await publishScene(s,input.action==='complete'?'encounter:sceneUpdated':'encounter:sceneOpened');return {requiresConfirmation:false,scene:await this.get(player,c,e,s)};
  }
  async end(player:string,c:string,e:string){await sceneTransaction(async session=>{await sceneContext(player,c,e,undefined,true,true,session);const scenes=await EncounterSceneModel.find({encounter:e,campaign:c}).session(session).lean();await EncounterSceneModel.updateMany({encounter:e,campaign:c},{$set:{status:'completed'},$inc:{revision:1}},{session});await ChatChannelModel.updateMany({_id:{$in:scenes.flatMap(s=>s.channel?[s.channel]:[])}},{$set:{archived:true}},{session});await EncounterExchangeModel.updateMany({encounter:e,status:'pending'},{$set:{status:'cancelled'}},{session});await EncounterDraftModel.updateOne({_id:e},{$set:{status:'ended'},$inc:{revision:1}},{session});});for(const scene of await EncounterSceneModel.find({encounter:e}).lean())await publishScene(sid(scene._id));return {status:'ended'};}
  async turn(player:string,c:string,e:string,s:string,input:any){const {scene,encounter}=await sceneContext(player,c,e,s,true,true);requireOpen(scene);checkRevision(scene,input.revision);const order=turns.execute(scene.turnOrder,encounter.participants.filter((p:any)=>scene.participantIds.includes(p.id)),input);const result=await EncounterSceneModel.updateOne({_id:s,revision:input.revision,status:'open'},{$set:{turnOrder:order},$inc:{revision:1}});if(!result.modifiedCount)throw new ErrorUtil('This scene changed. Reload before saving.',409);await publishScene(s);return this.get(player,c,e,s);}
  async transfer(player:string,c:string,e:string,s:string,input:any){
    if(s===input.targetSceneId)throw new ErrorUtil('Choose a different destination scene.',400);
    await sceneTransaction(async session=>{
      const {campaign,encounter,scene}=await sceneContext(player,c,e,s,true,true,session),target=(await sceneContext(player,c,e,input.targetSceneId,true,true,session)).scene;
      requireOpen(scene);requireOpen(target);checkRevision(scene,input.revision);checkRevision(target,input.targetRevision);
      if(input.participantIds.some((id:string)=>!scene.participantIds.includes(id)||target.participantIds.includes(id)))throw new ErrorUtil('Each moved participant must be in the source and absent from the destination.',400);
      const audience=await this.cast(campaign,encounter,[...target.participantIds,...input.participantIds],target.audiencePlayerIds,session,[s,sid(target._id)]);
      const moving=scene.turnOrder.slots.filter((slot:any)=>input.participantIds.includes(slot.participantId));
      let targetOrder=target.turnOrder;for(const slot of moving)targetOrder=turns.append(targetOrder,slot.participantId);
      const sourceOrder=turns.remove(scene.turnOrder,new Set(moving.map((slot:any)=>slot.id)));
      const sourceSaved=await EncounterSceneModel.updateOne({_id:s,revision:input.revision,status:'open'},{$set:{participantIds:scene.participantIds.filter((id:string)=>!input.participantIds.includes(id)),revealedParticipantIds:scene.revealedParticipantIds.filter((id:string)=>!input.participantIds.includes(id)),turnOrder:sourceOrder},$inc:{revision:1}},{session});if(!sourceSaved.modifiedCount)throw new ErrorUtil('Source scene changed. Reload before transferring.',409);
      const targetSaved=await EncounterSceneModel.updateOne({_id:target._id,revision:input.targetRevision,status:'open'},{$set:{participantIds:[...target.participantIds,...input.participantIds],revealedParticipantIds:[...target.revealedParticipantIds,...scene.revealedParticipantIds.filter((id:string)=>input.participantIds.includes(id))],audiencePlayerIds:audience,turnOrder:targetOrder},$inc:{revision:1}},{session});if(!targetSaved.modifiedCount)throw new ErrorUtil('Destination scene changed. Reload before transferring.',409);
      if(target.channel&&target.visibility==='private')await ChatChannelModel.updateOne({_id:target.channel},{$set:{participantPlayerIds:audience}},{session});
      await this.cancelDepartures(s,input.participantIds,session);
    });await publishScene(s);await publishScene(input.targetSceneId);return {source:await this.get(player,c,e,s),target:await this.get(player,c,e,input.targetSceneId)};
  }
}

