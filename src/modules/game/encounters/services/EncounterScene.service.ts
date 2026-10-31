import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { playerProfile } from '../utils/access';
import { parse } from '../utils/contracts';
import * as schema from '../utils/sceneContracts';
import EncounterSceneHandler from '../handlers/EncounterScene.handler';
import EncounterHealthHandler from '../handlers/EncounterHealth.handler';
import EncounterExchangeHandler from '../handlers/EncounterExchange.handler';
export default class EncounterSceneService {
  private scenes=new EncounterSceneHandler(); private health=new EncounterHealthHandler(); private exchanges=new EncounterExchangeHandler();
  private endpoint(work:(player:string,c:string,e:string,s:string,req:AuthenticatedRequest)=>Promise<any>,status=200){return asyncHandler(async(req:AuthenticatedRequest,res:Response)=>{res.setHeader('Cache-Control','private, no-store');try{const player=await playerProfile(req.user?._id);return res.status(status).json({success:true,payload:await work(player,req.params.campaignId,req.params.encounterId,req.params.sceneId,req)});}catch(error){return res.status(error instanceof ErrorUtil?error.statusCode:500).json({success:false,message:error instanceof ErrorUtil?error.message:'Encounter action could not be completed. Try again shortly.'});}});}
  list=this.endpoint((p,c,e)=>this.scenes.list(p,c,e));
  get=this.endpoint((p,c,e,s)=>this.scenes.get(p,c,e,s));
  create=this.endpoint((p,c,e,s,r)=>this.scenes.create(p,c,e,parse(schema.createScene,r.body)),201);
  update=this.endpoint((p,c,e,s,r)=>this.scenes.update(p,c,e,s,parse(schema.updateScene,r.body)));
  lifecycle=this.endpoint((p,c,e,s,r)=>this.scenes.lifecycle(p,c,e,s,parse(schema.lifecycle,r.body)));
  end=this.endpoint((p,c,e)=>this.scenes.end(p,c,e));
  turn=this.endpoint((p,c,e,s,r)=>this.scenes.turn(p,c,e,s,parse(schema.turn,r.body)));
  transfer=this.endpoint((p,c,e,s,r)=>this.scenes.transfer(p,c,e,s,parse(schema.transfer,r.body)));
  preview=this.endpoint((p,c,e,s,r)=>this.health.preview(p,c,e,s,parse(schema.health,r.body)));
  apply=this.endpoint((p,c,e,s,r)=>this.health.apply(p,c,e,s,parse(schema.applyHealth,r.body)));
  history=this.endpoint((p,c,e,s,r)=>this.health.history(p,r.params.characterId,r.query.cursor as string|undefined));
  listExchanges=this.endpoint((p,c,e,s,r)=>this.exchanges.list(p,c,e,s,r.query.cursor as string|undefined));
  attack=this.endpoint((p,c,e,s,r)=>this.exchanges.attack(p,c,e,s,parse(schema.attack,r.body)),201);
  defend=this.endpoint((p,c,e,s,r)=>this.exchanges.defend(p,c,e,s,r.params.exchangeId,parse(schema.defense,r.body)));
}
