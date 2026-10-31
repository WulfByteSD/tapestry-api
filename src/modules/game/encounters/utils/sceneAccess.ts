import { ClientSession } from 'mongoose';
import CampaignModel from '../../campaigns/model/CampaignModel';
import CharacterModel from '../../characters/model/CharacterModel';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { EncounterSceneModel } from '../models/EncounterScene.model';
import { EncounterDraftModel } from '../models/EncounterDraft.model';
import { objectId, parse } from './contracts';

export const sid = (value:any) => String(value?._id ?? value);
export function role(campaign:any, player:string) { return sid(campaign.owner) === player ? 'owner' : campaign.members.find((m:any)=>sid(m.player)===player)?.role; }
export function isManager(campaign:any, player:string) { return ['owner','sw','co-sw'].includes(role(campaign,player)); }
export function sceneVisible(scene:any,campaign:any,player:string) { return !!role(campaign,player) && (isManager(campaign,player) || (scene.status !== 'draft' && scene.published !== false && (scene.visibility === 'campaign' || scene.audiencePlayerIds.includes(player)))); }
export async function sceneContext(player:string,campaignId:string,encounterId?:string,sceneId?:string,manage=false,write=false,session?:ClientSession) {
  parse(objectId,campaignId);
  const campaign = await CampaignModel.findById(campaignId).session(session ?? null).lean();
  if (!campaign || !role(campaign,player)) throw new ErrorUtil('Campaign not found or no longer accessible.',403);
  if (manage && !isManager(campaign,player)) throw new ErrorUtil('Only campaign Storyweavers may manage encounters.',403);
  if(write && campaign.status==='archived') throw new ErrorUtil('Archived campaigns are read-only.',403);
  let encounter:any, scene:any;
  if(encounterId){ parse(objectId,encounterId); encounter=await EncounterDraftModel.findOne({_id:encounterId,campaign:campaignId}).session(session ?? null).lean(); if(!encounter) throw new ErrorUtil('Encounter not found.',404); }
  if(sceneId){ parse(objectId,sceneId); scene=await EncounterSceneModel.findOne({_id:sceneId,campaign:campaignId,encounter:encounterId}).session(session ?? null).lean(); if(!scene || !sceneVisible(scene,campaign,player)) throw new ErrorUtil('Scene not found.',404); }
  return {campaign,encounter,scene,manager:isManager(campaign,player)};
}
export async function eligibleCharacter(campaign:any,characterId:string,session?:ClientSession) {
  const character:any = await CharacterModel.findOne({_id:characterId,campaign:campaign._id,status:'active','meta.deletedAt':null}).session(session ?? null).lean();
  const member = character && campaign.members.find((m:any)=>sid(m.player)===sid(character.player) && m.role!=='observer' && m.characters?.some((c:any)=>sid(c)===characterId));
  return member ? character : null;
}
export async function accessibleSceneIds(player:string,campaignId?:string) {
  const campaigns:any[]=await CampaignModel.find({...(campaignId?{_id:campaignId}:{}),$or:[{owner:player},{'members.player':player}]} as any).lean();
  const scenes=await EncounterSceneModel.find({campaign:{$in:campaigns.map(c=>c._id)}}).lean();
  return scenes.filter(s=>sceneVisible(s,campaigns.find(c=>sid(c._id)===sid(s.campaign)),player)).map(s=>s._id);
}
