import { z } from 'zod';
import { Actor, ContentType } from '../types/McpTypes';
import { McpError } from '../util/McpError';
import { requireCapability, visibility } from '../util/mcpPolicy';
import { contentModels } from '../util/contentRegistry';
import { createSchemas, updateSchemas } from '../util/contentContracts';
import { readableRecord } from '../util/readableContent';

export class ContentReadHandler {
  /** Search authorized records with bounded pages and literal, escaped search text. */
  async search(actor: Actor, args: { type: ContentType; query?: string; settingKey?: string; status?: string; page?: number; limit?: number }) {
    requireCapability(actor, 'read');
    const filter: any = visibility(actor, args.type);
    if (args.status) filter.$and = [{ status: args.status }];
    if (args.settingKey) filter.$and = [...(filter.$and || []), { [args.type === 'settings' ? 'key' : args.type === 'lore' ? 'settingKey' : 'settingKeys']: args.settingKey }];
    if (args.query) {
      const escaped = args.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { key: { $regex: escaped, $options: 'i' } }];
    }
    const page = args.page || 1,
      limit = args.limit || 25;
    const docs = await contentModels[args.type]
      .find(filter)
      .sort({ _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .lean();
    const records = [];
    for (const doc of docs.slice(0, limit)) records.push(await readableRecord(actor, args.type, doc));
    return { records, page, hasMore: docs.length > limit };
  }
  /** Resolve an ID or native domain key without revealing whether unauthorized records exist. */
  async get(actor: Actor, args: { type: ContentType; id?: string; key?: string; settingKey?: string }) {
    requireCapability(actor, 'read');
    if (!args.id && !args.key) throw new McpError('validation', 'Supply an ID or domain key.');
    if (!args.id && ['lore', 'combatants'].includes(args.type) && !args.settingKey) throw new McpError('validation', 'This domain key requires a setting key.');
    const lookup: any = args.id ? { _id: args.id } : { key: args.key };
    if (args.settingKey && args.type === 'lore') lookup.settingKey = args.settingKey;
    if (args.settingKey && args.type === 'combatants') lookup.settingKeys = args.settingKey;
    const doc = await contentModels[args.type].findOne({ $and: [lookup, visibility(actor, args.type)] }).lean();
    if (!doc) throw new McpError('not_found', 'Content not found within this grant.', 404);
    return readableRecord(actor, args.type, doc);
  }
  /** Describe effective contracts and policy; include only authorized setting and lore context. */
  async context(actor: Actor, settingKey?: string) {
    requireCapability(actor, 'read');
    const schemas = Object.fromEntries(actor.contentTypes.map((type) => [type, { create: z.toJSONSchema(createSchemas[type]), update: z.toJSONSchema(updateSchemas[type]) }]));
    return {
      capabilities: actor.capabilities,
      contentTypes: actor.contentTypes,
      settingKeys: actor.settingKeys,
      shared: actor.shared,
      schemas,
      policy: {
        defaultStatus: 'draft',
        publishRequires: 'publish',
        maxBatch: 50,
        referencesMustExist: true,
        contentIsUntrustedData: true,
        canonVerified: false,
        proposalPublishing: 'Proposals may request published changes; an authorized human must approve them.',
        revisionRequired: true,
        operationIdRequired: true,
      },
      settings: await this.search(actor, { type: 'settings', settingKey, limit: 50 }),
      lore: settingKey ? await this.search(actor, { type: 'lore', settingKey, limit: 50 }) : undefined,
    };
  }
}
