import { z } from 'zod';
import AdventureCombatantsHandler from './AdventureCombatants.handler';
import Resource from '../../../library/models/Resource';
import RAG from '../../../library/models/RAG';
import { Adventure, AdventureRecord } from '../models/AdventureModel';
import { AdventureActor, materialQuery } from '../types/adventure.contracts';
import { activeGrant, materialView, parse, publishedContent, unavailable } from '../helpers/adventure.helpers';
import AdventureAccessHandler from './AdventureAccess.handler';

/** Entitled published reference reads; section links never gate navigation. */
export default class AdventureReferenceHandler {
  private readonly access = new AdventureAccessHandler();
  async ownerRead(actor: AdventureActor, id: string) {
    const adventure = publishedContent(await this.access.load(id));
    await this.access.library(adventure.libraryResourceId, true);
    if (!(await this.access.owns(actor, adventure))) throw unavailable();
    return new AdventureCombatantsHandler().resolve(adventure);
  }
  async list(actor: AdventureActor, page = 0) {
    const offset = parse(z.number().int().min(0).max(10000), page) * 50;
    const profile = await this.access.player(actor);
    const grants = await RAG.find({ userId: String(profile._id), ...activeGrant() })
      .select('resourceId')
      .lean();
    const library = await Resource.find({ _id: { $in: grants.map((grant) => grant.resourceId) }, kind: 'module', status: 'published', accessPolicy: 'entitlement' })
      .select('_id')
      .lean();
    const adventures = await Adventure.find({
      libraryResourceId: { $in: library.map((resource) => String(resource._id)) },
      status: 'published',
      publishedContent: { $exists: true },
    })
      .select('_id publishedContent.title publishedContent.summary status publishedRevision libraryResourceId')
      .sort({ _id: 1 })
      .skip(offset)
      .limit(50)
      .lean();
    return adventures.map((adventure) => ({
      _id: adventure._id,
      title: adventure.publishedContent!.title,
      summary: adventure.publishedContent!.summary,
      status: adventure.status,
      revision: adventure.publishedRevision,
      libraryResourceId: adventure.libraryResourceId,
    }));
  }
  resources(adventure: AdventureRecord, query: unknown) {
    const filter = parse(materialQuery, query);
    const section = filter.sectionId ? adventure.sections.find((entry) => entry.id === filter.sectionId) : undefined;
    if (filter.sectionId && !section) throw unavailable();
    return adventure.resources
      .filter(
        (resource) =>
          (!section || section.resourceIds.includes(resource.id)) && (!filter.kind || resource.kind === filter.kind) && (!filter.tag || resource.tags.includes(filter.tag))
      )
      .map(materialView);
  }
  async material(actor: AdventureActor, id: string, resourceId: string) {
    const adventure = await this.ownerRead(actor, id);
    const resource = adventure.resources.find(entry => entry.id === resourceId);
    if (!resource) throw unavailable();
    return resource;
  }
  async section(actor: AdventureActor, id: string, sectionId: string) {
    const adventure = await this.ownerRead(actor, id);
    const section = adventure.sections.find(entry => entry.id === sectionId);
    if (!section) throw unavailable();
    return { section, resources: this.resources(adventure, { sectionId }),
      encounters: adventure.encounters.filter(entry => section.encounterIds.includes(entry.id)) };
  }
}
