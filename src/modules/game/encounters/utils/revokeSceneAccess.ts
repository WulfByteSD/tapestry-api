import CharacterModel from '../../characters/model/CharacterModel';
import ChatChannelModel from '../../campaigns/model/ChatChannelModel';
import { EncounterDraftModel } from '../models/EncounterDraft.model';
import { EncounterSceneModel } from '../models/EncounterScene.model';
import { EncounterExchangeModel } from '../models/EncounterExchange.model';
import EncounterTurnOrderHandler from '../handlers/EncounterTurnOrder.handler';
import { sceneTransaction } from './sceneTransaction';
const turns=new EncounterTurnOrderHandler();
/** Persist removal, rather than merely hiding stale assignments that a rejoin could restore. */
export async function revokeSceneAccess(campaignId:string,playerId:string,characterId?:string){
  const exists=await EncounterSceneModel.exists({campaign:campaignId});if(!exists)return;
  await sceneTransaction(async session=>{
    const characters=await CharacterModel.find({player:playerId,...(characterId?{_id:characterId}:{})}).select('_id').session(session).lean();
    const charIds=new Set(characters.map(c=>String(c._id)));
    const encounters=await EncounterDraftModel.find({campaign:campaignId}).session(session).lean();
    const participantIds=encounters.flatMap(e=>e.participants.filter((p:any)=>p.kind==='character'&&charIds.has(p.provenance.id)).map((p:any)=>p.id));
    const scenes=await EncounterSceneModel.find({campaign:campaignId}).session(session).lean();
    for(const scene of scenes){
      const order=turns.remove(scene.turnOrder,new Set(scene.turnOrder.slots.filter((s:any)=>participantIds.includes(s.participantId)).map((s:any)=>s.id)));
      const audience=characterId?scene.audiencePlayerIds:scene.audiencePlayerIds.filter(p=>p!==playerId);
      await EncounterSceneModel.updateOne({_id:scene._id},{$set:{participantIds:scene.participantIds.filter(p=>!participantIds.includes(p)),turnOrder:order,audiencePlayerIds:audience},$inc:{revision:1}},{session});
      if(scene.channel&&scene.visibility==='private'){
        if(scene.status!=='draft'&&scene.published!==false)await ChatChannelModel.updateOne({_id:scene.channel},{$set:{participantPlayerIds:audience}},{session});
        else if(!characterId)await ChatChannelModel.updateOne({_id:scene.channel},{$pull:{participantPlayerIds:playerId}},{session});
      }
    }
    await EncounterExchangeModel.updateMany({campaign:campaignId,status:'pending',$or:[{actorParticipantId:{$in:participantIds}},{targetParticipantId:{$in:participantIds}}]},{$set:{status:'cancelled'}},{session});
  });
}
