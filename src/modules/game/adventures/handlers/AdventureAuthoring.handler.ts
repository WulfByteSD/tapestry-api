import { z } from 'zod';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import Combatant from '../../content/model/CombatantModel';
import { Adventure } from '../models/AdventureModel';
import { AdventureActor, AdventureContent, contentInput, createInput, statusInput, updateInput } from '../types/adventure.contracts';
import { parse, requireAdmin } from '../helpers/adventure.helpers';
import AdventureAccessHandler from './AdventureAccess.handler';

/** Admin draft CRUD and atomic publication of complete adventure snapshots. */
export default class AdventureAuthoringHandler {
  private readonly access = new AdventureAccessHandler();
  async preview(actor: AdventureActor, id: string) {
    requireAdmin(actor);
    return this.access.load(id);
  }
  async list(actor: AdventureActor, page = 0) {
    requireAdmin(actor);
    const offset = parse(z.number().int().min(0).max(10000), page) * 50;
    return Adventure.find().select('_id title summary status revision libraryResourceId').sort({ _id: 1 }).skip(offset).limit(50).lean();
  }
  private async validateCombatants(content: AdventureContent, published = false, previous?: AdventureContent) {
    const retained = new Set(previous?.encounters.flatMap(encounter => encounter.combatants.map(entry => entry.combatantId)) ?? []);
    // Preserve existing references after catalog removal; newly added IDs still must resolve.
    const ids = [...new Set(content.encounters.flatMap((encounter) => encounter.combatants.map((entry) => entry.combatantId)))].filter(id => published || !retained.has(id));
    if (!ids.length) return;
    const found = await Combatant.countDocuments({ _id: { $in: ids }, status: published ? 'published' : { $ne: 'archived' } });
    const expected = published ? await Combatant.countDocuments({ _id: { $in: ids } }) : ids.length;
    if (found !== expected) throw new ErrorUtil('Encounter combatants must exist and be available (published when publishing)', 400);
  }

  async create(actor: AdventureActor, input: unknown) {
    requireAdmin(actor);
    const data = parse(createInput, input);
    await this.access.library(data.libraryResourceId);
    await this.validateCombatants(data.content);
    return Adventure.create({ ...data.content, libraryResourceId: data.libraryResourceId });
  }

  async update(actor: AdventureActor, id: string, input: unknown) {
    requireAdmin(actor);
    const data = parse(updateInput, input);
    const current = await this.access.load(id);
    if (current.revision !== data.revision) throw new ErrorUtil('Adventure changed; reload before editing', 409);
    // Top-level authoring fields are the working draft. Owner reads use only publishedContent.
    await this.validateCombatants(data.content, false, current);
    const resources = data.content.resources.map((resource) => ({
      ...resource,
      ...(current.resources.find((existing) => existing.id === resource.id && existing.kind === resource.kind)?.asset
        ? { asset: current.resources.find((existing) => existing.id === resource.id)!.asset }
        : {}),
    }));
    const updated = await Adventure.findOneAndUpdate(
      { _id: id, revision: data.revision },
      { $set: { ...data.content, resources }, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) throw new ErrorUtil('Adventure changed; reload before editing', 409);
    return updated;
  }

  async changeStatus(actor: AdventureActor, id: string, input: unknown) {
    requireAdmin(actor);
    const data = parse(statusInput, input);
    const current = await this.access.load(id);
    if (current.revision !== data.revision) throw new ErrorUtil('Adventure changed; reload before publishing', 409);
    if (data.status === 'published') {
      await this.access.library(current.libraryResourceId, true);
      // Strip server-managed assets before contract validation.
      const normalized = parse(contentInput, {
        title: current.title,
        summary: current.summary,
        sections: current.sections,
        encounters: current.encounters,
        resources: current.resources.map(({ asset, ...resource }) => resource),
      });
      await this.validateCombatants(normalized, true);
      if (current.resources.some((resource) => resource.kind === 'map' && !resource.asset)) throw new ErrorUtil('Maps require a protected attachment before publication', 400);
    }
    const updated = await Adventure.findOneAndUpdate(
      { _id: id, revision: data.revision },
      {
        $set: {
          status: data.status,
          ...(data.status === 'published'
            ? {
                publishedAt: new Date(),
                publishedRevision: data.revision + 1,
                publishedContent: { title: current.title, summary: current.summary, sections: current.sections, resources: current.resources, encounters: current.encounters },
              }
            : {}),
        },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) throw new ErrorUtil('Adventure changed; reload before publishing', 409);
    return updated;
  }

  async remove(actor: AdventureActor, id: string, revision: number) {
    requireAdmin(actor);
    const current = await this.access.load(id);
    if (current.revision !== revision) throw new ErrorUtil('Adventure changed; reload before deleting', 409);
    if (current.status !== 'draft' || current.publishedAt) throw new ErrorUtil('Archive published adventures instead', 409);
    const result = await Adventure.deleteOne({ _id: id, revision, status: 'draft', publishedAt: null });
    if (!result.deletedCount) throw new ErrorUtil('Adventure changed; reload before deleting', 409);
  }
}
