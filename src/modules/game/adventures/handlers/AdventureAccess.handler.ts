import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import Player from '../../../profiles/player/model/PlayerModel';
import Campaign from '../../campaigns/model/CampaignModel';
import Resource from '../../../library/models/Resource';
import RAG from '../../../library/models/RAG';
import { Adventure, AdventureRecord } from '../models/AdventureModel';
import { AdventureActor, objectId } from '../types/adventure.contracts';
import { activeGrant, parse, unavailable } from '../helpers/adventure.helpers';

/** Current account entitlement, library publication and campaign membership checks. */
export default class AdventureAccessHandler {
  async load(id: string) {
    const adventure = await Adventure.findById(parse(objectId, id)).lean();
    if (!adventure) throw unavailable();
    return adventure;
  }
  async library(id: string, published = false) {
    const resource = await Resource.findOne({ _id: id, kind: 'module', accessPolicy: 'entitlement', ...(published ? { status: 'published' } : {}) }).lean();
    if (!resource) throw new ErrorUtil('An entitlement-protected module library resource is required', 404);
    return resource;
  }
  async player(actor: AdventureActor) {
    const profile = await Player.findOne({ user: actor.userId as any }).lean();
    if (!profile) throw new ErrorUtil('Player profile required', 403);
    return profile;
  }
  async hasGrant(playerId: string, libraryResourceId: string) {
    if (!playerId) return false; // Legacy/unattributed shares fail closed.
    return Boolean(await RAG.exists({ userId: playerId, resourceId: libraryResourceId, ...activeGrant() }));
  }
  async owns(actor: AdventureActor, adventure: AdventureRecord) {
    const profile = await this.player(actor);
    return this.hasGrant(String(profile._id), adventure.libraryResourceId);
  }
  async campaign(actor: AdventureActor, campaignId: string, manage = false) {
    const profile = await this.player(actor);
    const campaign = await Campaign.findById(parse(objectId, campaignId)).lean();
    if (!campaign || campaign.status !== 'active') throw unavailable();
    const owner = String(campaign.owner) === String(profile._id);
    const member = campaign.members.find((entry) => String(entry.player) === String(profile._id));
    if (manage ? !owner && !['sw', 'co-sw'].includes(member?.role || '') : !owner && !member) throw unavailable();
    return campaign;
  }
}
