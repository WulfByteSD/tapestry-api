import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Campaign from '../../campaigns/model/CampaignModel';
import Character from '../../characters/model/CharacterModel';
import Player from '../../../profiles/player/model/PlayerModel';
import ChatChannel from '../../campaigns/model/ChatChannelModel';
import ChatMessage from '../../campaigns/model/ChatMessageModel';
import RollLog from '../../characters/model/RollLog';
import { EncounterDraftModel } from '../models/EncounterDraft.model';
import { EncounterSceneModel } from '../models/EncounterScene.model';
import { EncounterExchangeModel } from '../models/EncounterExchange.model';
import { EncounterHealthAuditModel, EncounterHealthPreviewModel, EncounterHealthReceiptModel } from '../models/EncounterHealth.model';
import EncounterSceneHandler from '../handlers/EncounterScene.handler';
import EncounterHealthHandler from '../handlers/EncounterHealth.handler';
import EncounterExchangeHandler from '../handlers/EncounterExchange.handler';
import EncounterDraftHandler from '../handlers/EncounterDraft.handler';
import CampaignChatHandler from '../../campaigns/handlers/CampaignChat.handler';
import { CharacterHandler } from '../../characters/handlers/Character.handler';
import { RollHandler } from '../../characters/handlers/Roll.handler';
import CampaignActivityEventHandler from '../../campaigns/handlers/CampaignActivityEventHandler';
import CampaignActivity from '../../campaigns/model/CampaignActivityModel';
import { revokeCampaignChatMember } from '../../campaigns/chat/chatEvents';
import DiceRollerService from '../../utils/diceRoller/DiceRollerService';
import { eventBus } from '../../../../lib/eventBus';
import socket from '../../../../utils/socket';

const integration=process.env.TAPESTRY_CHAT_TEST_MONGO_BINARY?describe:describe.skip;
const oid=()=>new mongoose.Types.ObjectId().toHexString();
integration('encounter scenes: authorization, transactions and histories',()=>{
  let mongo:MongoMemoryReplSet,c:string,e:string,char:string,pc:string,npc:string,hidden:string;
  let users:Record<string,string>,players:Record<string,string>;
  const scenes:any=new EncounterSceneHandler(),health=new EncounterHealthHandler(),exchanges=new EncounterExchangeHandler(),chat=new CampaignChatHandler();
  const models:mongoose.Model<any>[]=[Campaign,Character,Player,ChatChannel,ChatMessage,RollLog,EncounterDraftModel,EncounterSceneModel,EncounterExchangeModel,EncounterHealthAuditModel,EncounterHealthPreviewModel,EncounterHealthReceiptModel,CampaignActivity];
  const snapshot=(name:string)=>({name,category:'npc',disposition:'hostile',statline:{hp:12,defenseTN:10,harm:'2',armor:3,move:'Near',actions:1,tags:[]},notes:{gm:'SECRET_NPC_NOTES'}});
  beforeAll(async()=>{mongo=await MongoMemoryReplSet.create({binary:{systemBinary:process.env.TAPESTRY_CHAT_TEST_MONGO_BINARY!},replSet:{count:1,storageEngine:'wiredTiger'}});await mongoose.connect(mongo.getUri());await Promise.all(models.map(m=>m.init()));jest.spyOn(eventBus,'publish').mockResolvedValue(undefined as never);jest.spyOn(DiceRollerService.prototype,'rollAdvanced').mockImplementation(async input=>({expression:'3d6',allRolls:[3,3,3],keptRolls:[3,3,3],total:9+(input.operations?.[0]?.value??0),breakdown:`9 + ${input.operations?.[0]?.value??0}`}));},60000);
  afterAll(async()=>{jest.restoreAllMocks();await mongoose.disconnect();await mongo?.stop();});
  beforeEach(async()=>{
    await Promise.all(models.map(m=>m.deleteMany({})));users={};players={};
    for(const name of ['sw','co','alice','bob','observer','outsider']){users[name]=oid();players[name]=String((await new Player({user:users[name],displayName:name}).save())._id);}
    c=String((await new Campaign({owner:players.sw,name:'The bridge',members:[{player:players.sw,role:'sw'},{player:players.co,role:'co-sw'},{player:players.alice,role:'player'},{player:players.bob,role:'player'},{player:players.observer,role:'observer'}]}).save())._id);
    char=String((await Character.create({player:players.alice,campaign:c,name:'Aster',sheet:{aspects:{might:{strength:1}},skills:{fighting:2},resources:{hp:{current:10,max:12,temp:3}},conditions:[{key:'tired',stacks:2,source:'old source',notes:'keep me'}],inventory:[{instanceId:'sword',category:'weapon',equipped:true,qty:1,attackProfiles:[{key:'strike',name:'Strike',defaultAspect:'might.strength',modifier:1}],selectedAttackProfileKey:'strike'},{instanceId:'armor',category:'armor',equipped:true,protection:2}]}}))._id);
    await Campaign.updateOne({_id:c,'members.player':players.alice} as any,{$set:{'members.$.characters':[char]}});
    pc=oid();npc=oid();hidden=oid();
    e=String((await EncounterDraftModel.create({campaign:c,title:'Bridge encounter',participants:[{id:pc,kind:'character',provenance:{kind:'character',id:char},snapshot:{name:'Aster',weaveLevel:0}},{id:npc,kind:'combatant',provenance:{kind:'personal',id:oid()},snapshot:snapshot('Visible sentry')},{id:hidden,kind:'combatant',provenance:{kind:'personal',id:oid()},snapshot:snapshot('HIDDEN_SENTRY')}]}))._id);
  });
  async function create(visibility='campaign',ids=[pc,npc,hidden],audience:string[]=[],mode='defense_tn'){
    const result:any=await scenes.create(players.sw,c,e,{title:'At the bridge',visibility,mode,channel:{kind:'new'},participantIds:ids,audiencePlayerIds:audience});expect(result.requiresConfirmation).toBe(false);return result.scene;
  }
  async function open(scene:any){return (await scenes.lifecycle(players.sw,c,e,scene.id,{revision:scene.revision,action:'open'})).scene;}
  async function reveal(scene:any,ids=[npc]){return (await scenes.update(players.sw,c,e,scene.id,{revision:scene.revision,revealedParticipantIds:ids})).scene;}
  async function latest(scene:any){return scenes.get(players.sw,c,e,scene.id);}
  const req=(who:string,channelId:string,body:any={},messageId?:string)=>({user:{_id:users[who]},params:{campaignId:c,channelId,messageId},body,query:{}} as any);
  const attack=(scene:any,key='attack')=>exchanges.attack(players.alice,c,e,scene.id,{requestKey:key,actorParticipantId:pc,targetParticipantId:npc,aspectKey:'might.strength'});

  it('keeps draft and private summaries private, validates management, and reveals only safe NPC display fields',async()=>{
    const draft=await create('private',[pc,npc,hidden]);
    expect(await scenes.list(players.alice,c)).toEqual([]);
    await expect(scenes.get(players.bob,c,e,draft.id)).rejects.toMatchObject({statusCode:404});
    await expect(scenes.create(players.alice,c,e,{title:'No'})).rejects.toMatchObject({statusCode:403});
    let scene=await open(draft);scene=await reveal(scene);
    const view:any=await scenes.get(players.alice,c,e,scene.id);
    expect(view.participants.map((p:any)=>p.id)).toEqual([pc,npc]);
    expect(JSON.stringify(view)).not.toMatch(/SECRET_NPC_NOTES|HIDDEN_SENTRY|"health"|"snapshot"|"statline"/);
    expect(view.audiencePlayerIds).toEqual([]);expect(view.playableCharacterIds).toEqual([char]);
    expect((await scenes.get(players.co,c,e,scene.id) as any).participants).toHaveLength(3);
    await expect(scenes.get(players.outsider,c,e,scene.id)).rejects.toMatchObject({statusCode:403});
  });
  it('keeps audience separate from cast, restricts IC speakers, and protects linked channel/system controls',async()=>{
    let scene=await open(await create('campaign'));
    await expect(chat.sendMessage(req('bob',scene.channelId,{clientMessageId:'b',content:'No',speaker:{type:'character',characterId:char}}))).rejects.toMatchObject({statusCode:403});
    await expect(chat.sendMessage(req('observer',scene.channelId,{clientMessageId:'o',content:'No',speaker:{type:'narrator'}}))).rejects.toMatchObject({statusCode:403});
    const sent=await chat.sendMessage(req('alice',scene.channelId,{clientMessageId:'a',content:'Hello',speaker:{type:'character',characterId:char}}));expect(sent.status).toBe(201);
    await expect(chat.updateChannel(req('sw',scene.channelId,{participantPlayerIds:[]}))).rejects.toMatchObject({statusCode:409});
    scene=(await scenes.update(players.sw,c,e,scene.id,{revision:scene.revision,participantIds:[npc,hidden]})).scene;
    expect(scene.audiencePlayerIds).toContain(players.alice);
    await expect(chat.sendMessage(req('alice',scene.channelId,{clientMessageId:'a2',content:'No',speaker:{type:'character',characterId:char}}))).rejects.toMatchObject({statusCode:403});
    expect((await chat.listMessages(req('alice',scene.channelId))).body.payload).toHaveLength(1);
  });
  it('denies audience removal while an owned character remains cast and validates attachment',async()=>{
    let scene=await create('private');
    await expect(scenes.update(players.sw,c,e,scene.id,{revision:scene.revision,audiencePlayerIds:[]})).rejects.toMatchObject({statusCode:400});
    await Character.updateOne({_id:char},{$set:{campaign:null}});
    await expect(open(scene)).rejects.toMatchObject({statusCode:400});
  });
  it('invalidates revoked private audience rooms without publishing the removed scene payload',async()=>{
    let scene=await open(await create('private',[pc,npc],[players.bob]));
    const sent:Array<{room:string;event:string;payload:any}>=[];
    const io=jest.spyOn(socket,'getIO').mockReturnValue({to:(room:string)=>({emit:(event:string,payload:any)=>sent.push({room,event,payload})})} as any);
    scene=(await scenes.update(players.sw,c,e,scene.id,{revision:scene.revision,audiencePlayerIds:[players.alice]})).scene;io.mockRestore();
    const revoked=sent.filter(item=>item.room===`chat:user:${players.bob}`);expect(revoked).toHaveLength(1);expect(revoked[0]).toMatchObject({event:'chat:access:changed',payload:{campaignId:c,channelIds:[]}});expect(JSON.stringify(revoked)).not.toContain(scene.id);
  });
  it('requires transfer rather than duplicate cast membership in unfinished scenes',async()=>{
    let first=await open(await create('private',[pc,npc]));
    await expect(create('private',[pc])).rejects.toMatchObject({statusCode:409});
    let second=await create('private',[hidden]);
    await expect(scenes.update(players.sw,c,e,second.id,{revision:second.revision,participantIds:[hidden,pc]})).rejects.toMatchObject({statusCode:409});
    first=(await scenes.lifecycle(players.sw,c,e,first.id,{revision:first.revision,action:'complete'})).scene;
    second=(await scenes.update(players.sw,c,e,second.id,{revision:second.revision,participantIds:[hidden,pc]})).scene;
    await expect(scenes.lifecycle(players.sw,c,e,first.id,{revision:first.revision,action:'reopen'})).rejects.toMatchObject({statusCode:409});
    expect(second.participants.map((p:any)=>p.id)).toContain(pc);
  });
  it('preserves existing IC history and visibility, prevents channel relink, and requires Discord standalone scenes',async()=>{
    const channel=await ChatChannel.create({campaign:c,name:'Existing',mode:'ic',visibility:'private',participantPlayerIds:[players.bob]});
    await ChatMessage.create({campaign:c,channel:channel._id,clientMessageId:'old',author:{player:players.bob,displayName:'bob'},speaker:{type:'narrator'},content:'Old history'});
    const result:any=await scenes.create(players.sw,c,e,{title:'Linked',visibility:'private',mode:'defense_tn',channel:{kind:'existing',channelId:String(channel._id)},participantIds:[pc],audiencePlayerIds:[]});
    expect(result.scene.audiencePlayerIds).toEqual(expect.arrayContaining([players.alice,players.bob]));
    expect((await ChatChannel.findById(channel._id).lean())?.participantPlayerIds.map(String)).toEqual([players.bob]);
    expect((await chat.listMessages(req('bob',String(channel._id)))).body.payload).toHaveLength(1);
    expect((await chat.listChannels(req('bob',String(channel._id)))).body.payload[0]).toMatchObject({canPost:false});
    await expect(chat.listMessages(req('alice',String(channel._id)))).rejects.toMatchObject({statusCode:403});
    const draftUpdate:any=await scenes.update(players.sw,c,e,result.scene.id,{revision:result.scene.revision,audiencePlayerIds:[players.alice,players.observer]});
    await expect(chat.listMessages(req('observer',String(channel._id)))).rejects.toMatchObject({statusCode:403});
    expect((await chat.listMessages(req('bob',String(channel._id)))).body.payload).toHaveLength(1);
    const emitted:Array<{room:string;event:string}>=[];const io=jest.spyOn(socket,'getIO').mockReturnValue({to:(room:string)=>({emit:(event:string)=>emitted.push({room,event})})} as any);
    await open(draftUpdate.scene);
    io.mockRestore();expect(emitted).toContainEqual({room:`chat:user:${players.bob}`,event:'chat:access:changed'});
    await expect(chat.listMessages(req('bob',String(channel._id)))).rejects.toMatchObject({statusCode:403});
    expect((await chat.listMessages(req('alice',String(channel._id)))).body.payload).toHaveLength(1);
    expect((await chat.listMessages(req('observer',String(channel._id)))).body.payload).toHaveLength(1);
    expect(await ChatMessage.countDocuments({channel:channel._id})).toBe(1);
    await expect(scenes.create(players.sw,c,e,{title:'Again',visibility:'private',mode:'defense_tn',channel:{kind:'existing',channelId:String(channel._id)},participantIds:[]})).rejects.toMatchObject({statusCode:409});
    await expect(scenes.create(players.sw,c,e,{title:'Wrong',visibility:'campaign',mode:'defense_tn',channel:{kind:'standalone'},participantIds:[]})).rejects.toMatchObject({statusCode:400});
    await Campaign.updateOne({_id:c},{$set:{playSurface:'discord'}});
    const standalone:any=await scenes.create(players.sw,c,e,{title:'Discord',visibility:'campaign',mode:'defense_tn',channel:{kind:'standalone'},participantIds:[]});expect(standalone.scene.channelId).toBeNull();
  });
  it('warns about concurrent active encounters and requires confirmation to open',async()=>{
    await EncounterDraftModel.create({campaign:c,status:'active',title:'Other fight',participants:[{id:oid(),kind:'character',provenance:{kind:'character',id:char},snapshot:{name:'Aster',weaveLevel:0}}]});
    const input={title:'Overlap',visibility:'campaign',mode:'defense_tn',channel:{kind:'new'},participantIds:[pc]};
    const warning:any=await scenes.create(players.sw,c,e,input);expect(warning.requiresConfirmation).toBe(true);expect(await EncounterSceneModel.countDocuments()).toBe(0);
    const created:any=await scenes.create(players.sw,c,e,{...input,confirmOverlap:true});
    expect((await scenes.lifecycle(players.sw,c,e,created.scene.id,{revision:0,action:'open'})).requiresConfirmation).toBe(true);
    expect((await scenes.lifecycle(players.sw,c,e,created.scene.id,{revision:0,action:'open',confirmOverlap:true})).requiresConfirmation).toBe(false);
  });
  it('redacts cross-campaign encounter identifiers and titles in overlap warnings',async()=>{
    const other=await new Campaign({owner:players.outsider,name:'PRIVATE_TABLE'}).save();
    const encounter=await EncounterDraftModel.create({campaign:other._id,status:'active',title:'PRIVATE_ENCOUNTER',participants:[{id:oid(),kind:'character',provenance:{kind:'character',id:char},snapshot:{name:'Aster',weaveLevel:0}}]});
    const warning:any=await scenes.create(players.sw,c,e,{title:'Overlap',visibility:'campaign',mode:'defense_tn',channel:{kind:'new'},participantIds:[pc]});
    expect(warning).toMatchObject({requiresConfirmation:true,overlaps:[{characterName:'Aster',encounterTitle:'Another active encounter'}]});
    expect(warning.overlaps[0].encounterId).toBeUndefined();expect(JSON.stringify(warning)).not.toMatch(/PRIVATE_TABLE|PRIVATE_ENCOUNTER/);expect(JSON.stringify(warning)).not.toContain(String(encounter._id));
  });
  it('does not publish unopened draft scenes or their new channels when ending an encounter',async()=>{
    const draft=await create('campaign');expect(await scenes.list(players.alice,c)).toEqual([]);
    expect((await chat.listChannels(req('alice',draft.channelId))).body.payload).toEqual([]);
    await scenes.end(players.sw,c,e);
    expect(await scenes.list(players.alice,c)).toEqual([]);await expect(scenes.get(players.alice,c,e,draft.id)).rejects.toMatchObject({statusCode:404});
    expect((await chat.listChannels(req('alice',draft.channelId))).body.payload).toEqual([]);await expect(chat.listMessages(req('alice',draft.channelId))).rejects.toMatchObject({statusCode:404});
    const ended:any=await latest(draft);await scenes.lifecycle(players.sw,c,e,draft.id,{revision:ended.revision,action:'reopen'});
    expect(await scenes.list(players.alice,c)).toHaveLength(1);expect((await chat.listChannels(req('alice',draft.channelId))).body.payload).toHaveLength(1);
  });
  it('applies harm protection then temporary HP, preserves conditions, and commits exactly one immutable audit/receipt',async()=>{
    const scene=await open(await create());
    const preview:any=await health.preview(players.sw,c,e,scene.id,{participantId:pc,action:'harm',amount:7,condition:{key:'exposed',notes:'Flanked'}});
    expect(preview).toMatchObject({protection:2,effectiveHarm:5,tempAbsorbed:3,after:{hp:{current:8,max:12,temp:0}}});
    const results=await Promise.all([health.apply(players.sw,c,e,scene.id,{token:preview.token,requestKey:'health'}),health.apply(players.sw,c,e,scene.id,{token:preview.token,requestKey:'health'})]);
    expect(results[0].id).toBe(results[1].id);expect(await EncounterHealthAuditModel.countDocuments()).toBe(1);expect(await EncounterHealthReceiptModel.countDocuments()).toBe(1);
    const character=await Character.findById(char).lean();expect(character?.sheet.resources.hp.current).toBe(8);expect(character?.sheet.conditions[0]).toMatchObject({key:'tired',stacks:2,source:'old source',notes:'keep me'});expect(character?.sheet.conditions[1].key).toBe('exposed');
    await expect(health.apply(players.sw,c,e,scene.id,{token:preview.token,requestKey:'different'})).rejects.toMatchObject({statusCode:409});
  });
  it('rejects stale previews and stale whole-sheet health edits, and keeps NPC runtime independent of preparation',async()=>{
    const scene=await open(await create());const baseline=await Character.findById(char).lean();
    const preview:any=await health.preview(players.sw,c,e,scene.id,{participantId:pc,action:'heal',amount:1});
    await Character.updateOne({_id:char},{$set:{'sheet.resources.hp.current':4},$inc:{__v:1}});
    await expect(health.apply(players.sw,c,e,scene.id,{token:preview.token,requestKey:'stale'})).rejects.toMatchObject({statusCode:409});expect(await EncounterHealthAuditModel.countDocuments()).toBe(0);
    await expect(new CharacterHandler().update(char,{'sheet.resources.hp.current':9,expectedHealthState:{hp:baseline!.sheet.resources.hp,conditions:baseline!.sheet.conditions}})).rejects.toMatchObject({statusCode:409});
    const npcPreview:any=await health.preview(players.sw,c,e,scene.id,{participantId:npc,action:'harm',amount:5});await health.apply(players.sw,c,e,scene.id,{token:npcPreview.token,requestKey:'npc'});
    const encounter:any=await EncounterDraftModel.findById(e).lean();expect(encounter.runtime[npc].hp.current).toBe(10);expect(encounter.participants.find((p:any)=>p.id===npc).snapshot.statline.hp).toBe(12);
    await expect(new EncounterDraftHandler().changeParticipant(players.sw,c,e,npc,encounter.revision,'remove')).rejects.toMatchObject({statusCode:409});
  });
  it('suggests a condition for fully blocked harm and logs an explicit no-effect override without bypassing armor',async()=>{
    const scene=await open(await create());const preview:any=await health.preview(players.sw,c,e,scene.id,{participantId:pc,action:'harm',amount:1});expect(preview.suggestsCondition).toBe(true);
    await expect(health.apply(players.sw,c,e,scene.id,{token:preview.token,requestKey:'blocked'})).rejects.toMatchObject({statusCode:400});
    const override:any=await health.preview(players.sw,c,e,scene.id,{participantId:pc,action:'harm',amount:1,allowBlockedWithoutCondition:true,notes:'The shield absorbs this glancing blow.'});
    const audit:any=await health.apply(players.sw,c,e,scene.id,{token:override.token,requestKey:'override'});expect(audit.after.hp.current).toBe(10);expect(audit.calculation).toMatchObject({effectiveHarm:0,allowBlockedWithoutCondition:true});
  });
  it('rolls back HP, scene version and receipt when immutable audit insertion fails',async()=>{
    const scene=await open(await create());const preview:any=await health.preview(players.sw,c,e,scene.id,{participantId:pc,action:'harm',amount:8});
    const failure=jest.spyOn(EncounterHealthAuditModel,'create').mockRejectedValueOnce(new Error('Synthetic audit failure'));
    await expect(health.apply(players.sw,c,e,scene.id,{token:preview.token,requestKey:'rollback'})).rejects.toThrow('Synthetic audit failure');failure.mockRestore();
    expect((await Character.findById(char).lean())?.sheet.resources.hp.current).toBe(10);expect((await latest(scene)).revision).toBe(scene.revision);expect(await EncounterHealthAuditModel.countDocuments()).toBe(0);expect(await EncounterHealthReceiptModel.countDocuments()).toBe(0);
  });
  it('fails closed before writes when transactional storage is unavailable',async()=>{
    const scene=await open(await create());const preview:any=await health.preview(players.sw,c,e,scene.id,{participantId:pc,action:'harm',amount:8});
    const unsupported=jest.spyOn(mongoose.connection.db!,'admin').mockReturnValue({command:async()=>({isWritablePrimary:true})} as any);
    await expect(health.apply(players.sw,c,e,scene.id,{token:preview.token,requestKey:'unsupported'})).rejects.toMatchObject({statusCode:503});unsupported.mockRestore();
    expect((await Character.findById(char).lean())?.sheet.resources.hp.current).toBe(10);expect(await EncounterHealthAuditModel.countDocuments()).toBe(0);expect(await EncounterHealthReceiptModel.countDocuments()).toBe(0);
  });
  it('rejects failed scene CAS before persisting any canonical roll',async()=>{
    let scene=await open(await create());scene=await reveal(scene);
    const stale=jest.spyOn(EncounterSceneModel,'updateOne').mockResolvedValueOnce({modifiedCount:0} as any);
    await expect(attack(scene)).rejects.toMatchObject({statusCode:409});stale.mockRestore();expect(await RollLog.countDocuments()).toBe(0);expect(await EncounterExchangeModel.countDocuments()).toBe(0);
  });
  it('redacts hidden sources and inaccessible scene metadata in owner audit, retaining actor and resource history',async()=>{
    const scene=await open(await create('private'));
    const preview:any=await health.preview(players.sw,c,e,scene.id,{participantId:pc,action:'harm',amount:5,sourceParticipantId:hidden});await health.apply(players.sw,c,e,scene.id,{token:preview.token,requestKey:'audit'});
    const visible:any=await health.history(players.alice,char);expect(visible.items[0].sourceLabel).toBeUndefined();expect(visible.items[0].actorName).toBe('sw');
    const current:any=await latest(scene);await scenes.update(players.sw,c,e,scene.id,{revision:current.revision,participantIds:[npc,hidden],audiencePlayerIds:[]});
    const redacted:any=await health.history(players.alice,char);expect(redacted.items[0].sceneTitle).toBeUndefined();expect(redacted.items[0].encounterId).toBeUndefined();expect(redacted.items[0].before.hp.current).toBe(10);
    await expect(health.history(players.bob,char)).rejects.toMatchObject({statusCode:403});
  });
  it('derives attack modifiers, validates targets and equipment, uses static >= TN, and deduplicates canonical rolls/transcript',async()=>{
    let scene=await open(await create());scene=await reveal(scene);
    await expect(exchanges.attack(players.bob,c,e,scene.id,{requestKey:'wrong',actorParticipantId:pc,targetParticipantId:npc,aspectKey:'might.strength'})).rejects.toMatchObject({statusCode:403});
    await expect(exchanges.attack(players.alice,c,e,scene.id,{requestKey:'hidden',actorParticipantId:pc,targetParticipantId:hidden,aspectKey:'might.strength'})).rejects.toMatchObject({statusCode:400});
    const input={requestKey:'weapon',actorParticipantId:pc,targetParticipantId:npc,weaponInstanceId:'sword',attackProfileKey:'strike',skillKey:'fighting'};
    const result:any=await exchanges.attack(players.alice,c,e,scene.id,input);expect(result.attack.total).toBe(13);expect(result.outcome).toBe('hit');
    expect((await exchanges.attack(players.alice,c,e,scene.id,input)).id).toBe(result.id);expect(await RollLog.countDocuments()).toBe(1);expect(await ChatMessage.countDocuments({'systemEntry.exchangeId':result.id})).toBe(1);
    const transcript=await chat.listMessages(req('alice',scene.channelId));expect(transcript.body.payload[0].systemEntry.exchange.id).toBe(result.id);
    await expect(chat.deleteMessage(req('sw',scene.channelId,{},transcript.body.payload[0].id))).rejects.toMatchObject({statusCode:403});
    const miss:any=await exchanges.attack(players.alice,c,e,scene.id,{requestKey:'miss',actorParticipantId:pc,targetParticipantId:npc,aspectKey:'might.strength',modifier:-1});expect(miss.attack.total).toBe(9);expect(miss.outcome).toBe('miss');
    const preview:any=await health.preview(players.sw,c,e,scene.id,{participantId:npc,action:'harm',amount:5,sourceParticipantId:pc,exchangeId:result.id});
    const audit:any=await health.apply(players.sw,c,e,scene.id,{token:preview.token,requestKey:'exchange-harm'});expect(audit.exchangeId).toBe(result.id);expect((await EncounterHealthAuditModel.findById(audit.id).lean())?.exchangeId).toBe(result.id);
  });
  it('resolves one opposed defense under concurrency, awards ties to defender and keeps snapshots after RollLog expiry',async()=>{
    let scene=await open(await create('campaign',[pc,npc],[],'opposed'));scene=await reveal(scene);const exchange:any=await attack(scene);
    const results=await Promise.allSettled([exchanges.defend(players.sw,c,e,scene.id,exchange.id,{requestKey:'defense-a',aspectKey:'might.strength',aspectValue:1}),exchanges.defend(players.co,c,e,scene.id,exchange.id,{requestKey:'defense-b',aspectKey:'might.strength',aspectValue:1})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await RollLog.countDocuments()).toBe(2);
    const saved:any=await EncounterExchangeModel.findById(exchange.id).lean();expect(saved.outcome).toBe('miss');expect(saved.defense.total).toBe(saved.attack.total);
    await RollLog.deleteMany({});const history=await exchanges.list(players.alice,c,e,scene.id);expect(history.items[0].attack.total).toBe(10);expect(history.items[0].defense.total).toBe(10);
  });
  it('excludes private scene rolls from campaign/general/own query surfaces and Feed events',async()=>{
    let scene=await open(await create('private'));scene=await reveal(scene);const exchange:any=await attack(scene);
    const roll=await RollLog.findById(exchange.attack.id).select('+discordDelivery').lean();expect(roll?.discordDelivery).toBeUndefined();
    const options={filters:[],sort:{createdAt:-1 as const},query:[],page:1,limit:100};const rolls=new RollHandler();
    for(const campaignId of [c,undefined]){expect((await rolls.fetchAccessible(players.bob,options,campaignId))[0].entries).toHaveLength(0);expect((await rolls.fetchAccessible(players.alice,options,campaignId))[0].entries).toHaveLength(1);}
    await new CampaignActivityEventHandler().onDiceRolled({rollId:exchange.attack.id,characterId:char,playerId:players.alice,campaignId:c,total:10,rollType:'attack'});expect(await CampaignActivity.countDocuments()).toBe(0);
    await Campaign.updateOne({_id:c},{$pull:{members:{player:players.alice}}} as any);await revokeCampaignChatMember(c,players.alice);
    expect((await rolls.fetchAccessible(players.alice,{...options,filters:[{player:new mongoose.Types.ObjectId(players.alice)}]}))[0].entries).toHaveLength(0);
    await Campaign.updateOne({_id:c},{$push:{members:{player:players.alice,role:'player',characters:[char]}}} as any);
    await expect(scenes.get(players.alice,c,e,scene.id)).rejects.toMatchObject({statusCode:404});
  });
  it('allows managers to roll revealed NPC attacks against canonical live PC defense and other NPCs',async()=>{
    await EncounterDraftModel.updateOne({_id:e,'participants.id':npc},{$set:{'participants.$.snapshot.attacks':[{name:'Spear thrust',harm:'3',range:'Close'}]}});
    let scene=await reveal(await open(await create()));
    const input={requestKey:'npc-attack',actorParticipantId:npc,targetParticipantId:pc,aspectKey:'strength',aspectValue:4,combatantAttackIndex:0};
    expect((await scenes.get(players.alice,c,e,scene.id) as any).participants.find((p:any)=>p.id===pc).defenseTN).toBe(13);
    await expect(exchanges.attack(players.alice,c,e,scene.id,input)).rejects.toMatchObject({statusCode:403});
    await expect(exchanges.attack(players.sw,c,e,scene.id,{...input,actorParticipantId:hidden})).rejects.toMatchObject({statusCode:400});
    await expect(exchanges.attack(players.sw,c,e,scene.id,{...input,targetParticipantId:npc})).rejects.toMatchObject({statusCode:400});
    await expect(exchanges.attack(players.sw,c,e,scene.id,{...input,weaponInstanceId:'sword'})).rejects.toMatchObject({statusCode:400});
    await expect(exchanges.attack(players.sw,c,e,scene.id,{...input,combatantAttackIndex:9})).rejects.toMatchObject({statusCode:400});
    const result:any=await exchanges.attack(players.co,c,e,scene.id,input);
    expect(result).toMatchObject({actorKind:'combatant',targetKind:'character',targetCharacterId:char,targetNumber:13,outcome:'hit',attack:{total:13,profileName:'Spear thrust',harm:'3',range:'Close'}});
    expect((await exchanges.attack(players.co,c,e,scene.id,input)).id).toBe(result.id);
    const log:any=await RollLog.findById(result.attack.id).lean();expect(log).toMatchObject({character:null,rollType:'attack',actorNameSnapshot:'Visible sentry'});expect(String(log.player)).toBe(players.co);
    const options={filters:[],sort:{createdAt:-1 as const},query:[],page:1,limit:100};
    expect(((await new RollHandler().fetchAccessible(players.alice,options,c))[0].entries[0] as any).characterName).toBe('Visible sentry');
    await new CampaignActivityEventHandler().onDiceRolled({rollId:result.attack.id,characterId:null,playerId:players.co,campaignId:c,total:13,rollType:'attack'});
    expect((await CampaignActivity.findOne().lean())?.actor.characterNameSnapshot).toBe('Visible sentry');
    scene=await reveal(await latest(scene),[npc,hidden]);
    const other:any=await exchanges.attack(players.sw,c,e,scene.id,{...input,requestKey:'npc-v-npc',targetParticipantId:hidden});expect(other.targetKind).toBe('combatant');
    await expect(exchanges.attack(players.sw,c,e,scene.id,{...input,requestKey:'impersonate',actorParticipantId:pc,targetParticipantId:npc})).rejects.toMatchObject({statusCode:403});
  });
  it('allows PC owners or Storyweavers to defend using the current sheet and resolves one defense only',async()=>{
    let scene=await reveal(await open(await create('campaign',[pc,npc],[],'opposed')));
    const input={requestKey:'npc-opposed',actorParticipantId:npc,targetParticipantId:pc,aspectKey:'strength',aspectValue:4};
    const result:any=await exchanges.attack(players.sw,c,e,scene.id,input);
    const defense={requestKey:'pc-defense',aspectKey:'strength',skillKey:'fighting'};
    for(const who of ['bob','observer'])await expect(exchanges.defend(players[who],c,e,scene.id,result.id,defense)).rejects.toMatchObject({statusCode:403});
    await expect(exchanges.defend(players.alice,c,e,scene.id,result.id,{...defense,aspectValue:20})).rejects.toMatchObject({statusCode:400});
    await Character.updateOne({_id:char},{$set:{'sheet.aspects.might.strength':2}});
    const resolved:any=await exchanges.defend(players.alice,c,e,scene.id,result.id,defense);expect(resolved.defense.total).toBe(13);expect(resolved.outcome).toBe('miss');
    expect((await exchanges.defend(players.alice,c,e,scene.id,result.id,defense)).id).toBe(result.id);
    expect(await RollLog.countDocuments()).toBe(2);
    const log:any=await RollLog.findById(resolved.defense.id).lean();expect(String(log.character)).toBe(char);expect(log.rollType).toBe('defense');
    const second:any=await exchanges.attack(players.sw,c,e,scene.id,{...input,requestKey:'second'});
    const results=await Promise.allSettled([exchanges.defend(players.co,c,e,scene.id,second.id,{...defense,requestKey:'sw-defense'}),exchanges.defend(players.alice,c,e,scene.id,second.id,{...defense,requestKey:'owner-defense'})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await RollLog.countDocuments()).toBe(4);
  });
  it('keeps combatant action/dialogue identity, portraits, edits, replies and retry keys scoped to revealed scene cast',async()=>{
    await EncounterDraftModel.updateOne({_id:e,'participants.id':npc},{$set:{'participants.$.snapshot.media':{portraitUrl:'https://example.com/sentry.png'}}});
    let scene=await reveal(await open(await create('private')));
    const body={clientMessageId:'npc-chat',content:'',speaker:{type:'combatant',participantId:npc},composition:{parts:[{type:'action',text:'Raises a hand.'},{type:'dialogue',text:'Halt.'}]}};
    await expect(chat.sendMessage(req('alice',scene.channelId,body))).rejects.toMatchObject({statusCode:403});
    await expect(chat.sendMessage(req('sw',scene.channelId,{...body,speaker:{type:'combatant',participantId:hidden}}))).rejects.toMatchObject({statusCode:403});
    const sent:any=(await chat.sendMessage(req('sw',scene.channelId,body))).body.payload;
    expect(sent.speaker).toMatchObject({type:'combatant',participantId:npc,characterId:null,characterName:'Visible sentry',avatar:'https://example.com/sentry.png'});expect(sent.author.playerId).toBe(players.sw);
    expect((await chat.sendMessage(req('sw',scene.channelId,body))).status).toBe(200);
    const edited:any=(await chat.updateMessage(req('sw',scene.channelId,{content:'',composition:{action:'Lowers a hand.',dialogue:'Pass.'}},sent.id))).body.payload;expect(edited.composition.dialogue).toBe('Pass.');
    const reply:any=(await chat.sendMessage(req('alice',scene.channelId,{clientMessageId:'reply',content:'Thanks.',speaker:{type:'character',characterId:char},replyToMessageId:sent.id}))).body.payload;
    expect(reply.replyTo.speaker).toMatchObject({participantId:npc,characterName:'Visible sentry',avatar:'https://example.com/sentry.png'});
    await expect(chat.listMessages(req('bob',scene.channelId))).rejects.toMatchObject({statusCode:403});
    scene=await reveal(await latest(scene),[npc,hidden]);
    await expect(chat.sendMessage(req('sw',scene.channelId,{...body,speaker:{type:'combatant',participantId:hidden}}))).rejects.toMatchObject({statusCode:409});
    const longName='S'.repeat(200);
    await EncounterDraftModel.updateOne({_id:e,'participants.id':hidden},{$set:{'participants.$.snapshot.name':longName}});
    const longSpeaker:any=(await chat.sendMessage(req('co',scene.channelId,{...body,clientMessageId:'long-name',speaker:{type:'combatant',participantId:hidden}}))).body.payload;
    expect(longSpeaker.speaker.characterName).toBe(longName);
    const ordinary=await ChatChannel.create({campaign:c,name:'Ordinary IC',mode:'ic',visibility:'campaign'});
    await expect(chat.sendMessage(req('sw',String(ordinary._id),body))).rejects.toMatchObject({statusCode:403});
    scene=(await scenes.update(players.sw,c,e,scene.id,{revision:scene.revision,participantIds:[pc,hidden]})).scene;
    await expect(chat.sendMessage(req('sw',scene.channelId,{...body,clientMessageId:'outcast'}))).rejects.toMatchObject({statusCode:403});
  });
  it('keeps private NPC attacks and owner defenses out of public activity and unauthorized history',async()=>{
    const scene=await reveal(await open(await create('private',[pc,npc],[],'opposed')));
    const result:any=await exchanges.attack(players.sw,c,e,scene.id,{requestKey:'private-npc',actorParticipantId:npc,targetParticipantId:pc,aspectKey:'strength',aspectValue:1});
    const resolved:any=await exchanges.defend(players.alice,c,e,scene.id,result.id,{requestKey:'private-pc',aspectKey:'strength'});
    for(const rollId of [result.attack.id,resolved.defense.id]){
      expect((await RollLog.findById(rollId).select('+discordDelivery').lean())?.discordDelivery).toBeUndefined();
      await new CampaignActivityEventHandler().onDiceRolled({rollId,characterId:null,playerId:players.sw,campaignId:c,total:10,rollType:'attack'});
    }
    expect(await CampaignActivity.countDocuments()).toBe(0);
    await expect(exchanges.list(players.bob,c,e,scene.id)).rejects.toMatchObject({statusCode:404});
    const options={filters:[],sort:{createdAt:-1 as const},query:[],page:1,limit:100};expect((await new RollHandler().fetchAccessible(players.bob,options,c))[0].entries).toHaveLength(0);
  });
  it('transfers slot multiplicity and shared health, cancels pending exchanges, and retains the source audience',async()=>{
    let source=await open(await create('private',[pc,npc],[],'opposed'));source=await reveal(source);source=await scenes.turn(players.sw,c,e,source.id,{revision:source.revision,action:'add',participantId:pc});
    const target=await open(await create('private',[hidden]));await attack(source);source=await latest(source);
    const moved:any=await scenes.transfer(players.sw,c,e,source.id,{revision:source.revision,targetSceneId:target.id,targetRevision:target.revision,participantIds:[pc]});
    expect(moved.source.turnOrder.slots.filter((s:any)=>s.participantId===pc)).toHaveLength(0);expect(moved.target.turnOrder.slots.filter((s:any)=>s.participantId===pc)).toHaveLength(2);expect(moved.source.audiencePlayerIds).toContain(players.alice);expect(moved.target.audiencePlayerIds).toContain(players.alice);
    expect((await EncounterExchangeModel.findOne().lean())?.status).toBe('cancelled');
  });
  it('completes/archives and reopens state without reset; ending cancels pending and reopening reactivates encounter',async()=>{
    let scene=await open(await create('campaign',[pc,npc],[],'opposed'));scene=await reveal(scene);await attack(scene);scene=await latest(scene);
    const before=scene.turnOrder;scene=(await scenes.lifecycle(players.sw,c,e,scene.id,{revision:scene.revision,action:'complete'})).scene;
    expect((await ChatChannel.findById(scene.channelId).lean())?.archived).toBe(true);await expect(attack(scene,'after')).rejects.toMatchObject({statusCode:409});
    await scenes.end(players.sw,c,e);scene=await latest(scene);scene=(await scenes.lifecycle(players.sw,c,e,scene.id,{revision:scene.revision,action:'reopen'})).scene;
    expect(scene.turnOrder).toEqual(before);expect(scene.encounterStatus).toBe('active');expect((await ChatChannel.findById(scene.channelId).lean())?.archived).toBe(false);expect((await EncounterExchangeModel.findOne().lean())?.status).toBe('cancelled');
  });
});

