import { z } from 'zod';
import { objectId, updateTurnOrder } from './contracts';
const ids=z.array(objectId).max(100).refine(a=>new Set(a).size===a.length,'IDs must be unique.');
const title=z.string().trim().min(1).max(80), mode=z.enum(['defense_tn','opposed']);
const revision=z.number().int().min(0), requestKey=z.string().min(1).max(128);
export const createScene=z.object({title,visibility:z.enum(['campaign','private']),mode,channel:z.discriminatedUnion('kind',[z.object({kind:z.literal('existing'),channelId:objectId}).strict(),z.object({kind:z.literal('new')}).strict(),z.object({kind:z.literal('standalone')}).strict()]),participantIds:ids,audiencePlayerIds:ids.optional(),confirmOverlap:z.boolean().optional()}).strict();
export const updateScene=z.object({revision,title:title.optional(),mode:mode.optional(),participantIds:ids.optional(),audiencePlayerIds:ids.optional(),revealedParticipantIds:ids.optional(),confirmOverlap:z.boolean().optional()}).strict();
export const lifecycle=z.object({revision,action:z.enum(['open','complete','reopen']),confirmOverlap:z.boolean().optional()}).strict();
export const turn=updateTurnOrder;
export const transfer=z.object({revision,targetSceneId:objectId,targetRevision:revision,participantIds:ids.min(1)}).strict();
export const health=z.object({participantId:objectId,action:z.enum(['harm','heal','set_hp','add_condition','remove_condition']),amount:z.number().int().min(0).max(1000000).optional(),condition:z.object({key:z.string().trim().min(1).max(100),label:z.string().max(100).optional(),notes:z.string().max(2000).optional()}).strict().optional(),notes:z.string().max(2000).optional(),allowBlockedWithoutCondition:z.boolean().optional(),correctionOf:objectId.optional(),sourceParticipantId:objectId.optional(),exchangeId:objectId.optional()}).strict().superRefine((v,ctx)=>{if(['harm','heal','set_hp'].includes(v.action)&&v.amount===undefined)ctx.addIssue({code:'custom',message:'An amount is required.'});if(['add_condition','remove_condition'].includes(v.action)&&!v.condition)ctx.addIssue({code:'custom',message:'A condition is required.'});if(v.allowBlockedWithoutCondition&&!v.notes?.trim())ctx.addIssue({code:'custom',message:'Explain the blocked-harm override in notes.'});});
export const applyHealth=z.object({token:z.string().uuid(),requestKey}).strict();
const rollOptions={edge:z.boolean().optional(),burden:z.boolean().optional(),modifier:z.number().int().min(-100).max(100).optional()};
export const attack=z.object({requestKey,actorParticipantId:objectId,targetParticipantId:objectId,aspectValue:z.number().int().min(-20).max(20).optional(),combatantAttackIndex:z.number().int().min(0).optional(),aspectKey:z.string().max(80).optional(),skillKey:z.string().max(100).optional(),weaponInstanceId:z.string().max(150).optional(),attackProfileKey:z.string().max(150).optional(),...rollOptions}).strict();
export const defense=z.object({requestKey,aspectKey:z.string().max(80),aspectValue:z.number().int().min(-20).max(20).optional(),skillKey:z.string().max(100).optional(),...rollOptions}).strict();

