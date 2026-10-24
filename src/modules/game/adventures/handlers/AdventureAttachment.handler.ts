import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { Adventure } from '../models/AdventureModel';
import { AdventureActor, ProtectedAsset, objectId } from '../types/adventure.contracts';
import { parse, requireAdmin, unavailable } from '../helpers/adventure.helpers';
import AdventureAuthoringHandler from './AdventureAuthoring.handler';

/** Draft attachment eligibility and revision-safe persistence, independent of HTTP/storage. */
export default class AdventureAttachmentHandler {
  private readonly authoring = new AdventureAuthoringHandler();
  async preview(actor: AdventureActor, id: string, resourceId: string) {
    const adventure = await this.authoring.preview(actor, id);
    const resource = adventure.resources.find(entry => entry.id === resourceId);
    if (!resource) throw unavailable();
    return resource;
  }
  async prepare(actor: AdventureActor, id: string, resourceId: string, revision: number) {
    const adventure = await this.authoring.preview(actor, id);
    const resource = adventure.resources.find(entry => entry.id === resourceId);
    if (adventure.revision !== revision || !resource || !['map', 'handout'].includes(resource.kind))
      throw new ErrorUtil('An unchanged draft map or handout is required', 409);
    return { adventureId: String(adventure._id), resourceId: resource.id };
  }
  async saveAsset(actor: AdventureActor, id: string, resourceId: string, revision: number, asset: ProtectedAsset) {
    requireAdmin(actor);
    const updated = await Adventure.findOneAndUpdate(
      { _id: parse(objectId, id), revision, resources: { $elemMatch: { id: resourceId, kind: { $in: ['map', 'handout'] } } } },
      { $set: { 'resources.$.asset': asset }, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) throw new ErrorUtil('Draft resource changed; reload before attaching', 409);
    return updated;
  }
  async removeAsset(actor: AdventureActor, id: string, resourceId: string, revision: number) {
    requireAdmin(actor);
    const updated = await Adventure.findOneAndUpdate(
      { _id: parse(objectId, id), revision, 'resources.id': resourceId },
      { $unset: { 'resources.$.asset': 1 }, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) throw new ErrorUtil('Draft resource changed; reload before removing the attachment', 409);
    return updated;
  }
}
