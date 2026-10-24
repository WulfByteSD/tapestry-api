import Resource from '../../../library/models/Resource';
import { Adventure } from '../models/AdventureModel';
import { AdventureShare } from '../models/AdventureShareModel';
import { AdventureActor, objectId, StoredMaterial } from '../types/adventure.contracts';
import { materialView, parse, publishedContent, unavailable } from '../helpers/adventure.helpers';
import AdventureAccessHandler from './AdventureAccess.handler';
import AdventureReferenceHandler from './AdventureReference.handler';

/** Explicit campaign shares, attributed to the supplying Storyweaver's Player profile. */
export default class AdventureSharingHandler {
  private readonly access = new AdventureAccessHandler();
  private readonly reference = new AdventureReferenceHandler();
  private safe(resource: StoredMaterial) {
    return resource.visibility === 'players' && resource.kind !== 'storyweaver_note';
  }
  async share(actor: AdventureActor, campaignId: string, id: string, resourceId: string) {
    const adventure = await this.reference.ownerRead(actor, id);
    await this.access.campaign(actor, campaignId, true);
    const resource = adventure.resources.find(entry => entry.id === resourceId);
    if (!resource || !this.safe(resource)) throw unavailable();
    const profile = await this.access.player(actor);
    const filter = { campaignId: parse(objectId, campaignId), adventureId: String(adventure._id), resourceId };
    // Repeated shares never transfer sponsorship. Unshare then explicitly share to replace the supplier.
    const update = { $setOnInsert: { sharedByPlayerId: String(profile._id) } };
    try {
      await AdventureShare.updateOne(filter, update, { upsert: true, runValidators: true });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      await AdventureShare.updateOne(filter, update, { runValidators: true });
    }
    return materialView(resource);
  }
  async unshare(actor: AdventureActor, campaignId: string, id: string, resourceId: string) {
    await this.access.campaign(actor, campaignId, true);
    await AdventureShare.deleteOne({ campaignId: parse(objectId, campaignId), adventureId: parse(objectId, id), resourceId });
  }
  async sharedRead(actor: AdventureActor, campaignId: string, id: string, resourceId: string) {
    const adventure = publishedContent(await this.access.load(id));
    await this.access.library(adventure.libraryResourceId, true);
    const resource = adventure.resources.find(entry => entry.id === resourceId);
    if (!resource || !this.safe(resource)) throw unavailable();
    // Independent ownership survives loss of campaign or supplier access, but never bypasses publication.
    if (await this.access.owns(actor, adventure)) return resource;
    await this.access.campaign(actor, campaignId);
    const share = await AdventureShare.findOne({ campaignId: parse(objectId, campaignId), adventureId: String(adventure._id), resourceId }).lean();
    if (!share || !(await this.access.hasGrant(share.sharedByPlayerId, adventure.libraryResourceId))) throw unavailable();
    return resource;
  }
  async sharedList(actor: AdventureActor, campaignId: string) {
    await this.access.campaign(actor, campaignId);
    const shares = await AdventureShare.find({ campaignId: parse(objectId, campaignId) }).lean();
    const adventures = await Adventure.find({ _id: { $in: shares.map(share => share.adventureId) }, status: 'published' }).lean();
    const library = await Resource.find({ _id: { $in: adventures.map(adventure => adventure.libraryResourceId) },
      kind: 'module', accessPolicy: 'entitlement', status: 'published' }).select('_id').lean();
    const publishedIds = new Set(library.map(resource => String(resource._id)));
    const result: Array<ReturnType<typeof materialView> & { adventureId: string }> = [];
    for (const record of adventures) {
      if (!publishedIds.has(record.libraryResourceId) || !record.publishedContent) continue;
      const adventure = publishedContent(record);
      const owned = await this.access.owns(actor, adventure);
      for (const share of shares.filter(entry => entry.adventureId === String(record._id))) {
        const resource = adventure.resources.find(entry => entry.id === share.resourceId);
        if (!resource || !this.safe(resource)) continue;
        if (!owned && !(await this.access.hasGrant(share.sharedByPlayerId, adventure.libraryResourceId))) continue;
        result.push({ adventureId: String(record._id), ...materialView(resource) });
      }
    }
    return result;
  }
}
