import { z } from 'zod';

export const objectId = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/)
  .transform((value) => value.toLowerCase());
const key = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
const title = z.string().trim().min(1).max(200);
const text = z.string().max(100_000).default('');
const ids = z.array(key).max(200).default([]);
export const revisionInput = z.strictObject({ revision: z.number().int().nonnegative() });

export const materialInput = z
  .strictObject({
    id: key,
    title,
    kind: z.enum(['map', 'handout', 'story_text', 'storyweaver_note']),
    visibility: z.enum(['players', 'storyweaver']).default('storyweaver'),
    text,
    tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  })
  .refine((value) => value.kind !== 'storyweaver_note' || value.visibility === 'storyweaver', {
    message: 'Storyweaver notes cannot be player-visible',
  });

export const sectionInput = z.strictObject({
  id: key,
  title,
  storyText: text,
  storyweaverNotes: text,
  context: text,
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  resourceIds: ids,
  encounterIds: ids,
  links: z
    .array(z.strictObject({ sectionId: key, label: title, context: text }))
    .max(200)
    .default([]),
});
export const encounterInput = z.strictObject({
  id: key,
  title,
  notes: text,
  combatants: z
    .array(z.strictObject({ combatantId: objectId, quantity: z.number().int().min(1).max(1000) }))
    .max(100)
    .default([]),
});

export const contentInput = z
  .strictObject({
    title,
    summary: z.string().max(4000).default(''),
    sections: z.array(sectionInput).max(200).default([]),
    resources: z.array(materialInput).max(200).default([]),
    encounters: z.array(encounterInput).max(100).default([]),
  })
  .superRefine((value, ctx) => {
    const collections = [value.sections, value.resources, value.encounters];
    for (const entries of collections) {
      if (new Set(entries.map((entry) => entry.id)).size !== entries.length) ctx.addIssue({ code: 'custom', message: 'IDs must be unique within each adventure collection' });
    }
    const sections = new Set(value.sections.map((entry) => entry.id));
    const resources = new Set(value.resources.map((entry) => entry.id));
    const encounters = new Set(value.encounters.map((entry) => entry.id));
    for (const section of value.sections) {
      if (
        section.links.some((link) => !sections.has(link.sectionId)) ||
        section.resourceIds.some((id) => !resources.has(id)) ||
        section.encounterIds.some((id) => !encounters.has(id))
      )
        ctx.addIssue({ code: 'custom', message: 'Section associations must resolve inside this adventure' });
    }
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 2_000_000) ctx.addIssue({ code: 'custom', message: 'Adventure content exceeds 2 MB' });
  });
export const createInput = z.strictObject({ libraryResourceId: objectId, content: contentInput });
export const updateInput = z.strictObject({ revision: z.number().int().nonnegative(), content: contentInput });
export const statusInput = z.strictObject({ revision: z.number().int().nonnegative(), status: z.enum(['published', 'archived']) });
export const materialQuery = z.strictObject({
  sectionId: key.optional(),
  kind: z.enum(['map', 'handout', 'story_text', 'storyweaver_note']).optional(),
  tag: z.string().max(80).optional(),
});
export type AdventureContent = z.infer<typeof contentInput>;
export type Material = AdventureContent['resources'][number];
export interface ProtectedAsset {
  publicId: string;
  resourceType: 'image' | 'raw';
  format: string;
  contentType: string;
  bytes: number;
}
export interface StoredMaterial extends Material {
  asset?: ProtectedAsset;
}
export interface StoredContent extends Omit<AdventureContent, 'resources'> {
  resources: StoredMaterial[];
}

export interface AdventureActor { userId: string; permissions: string[]; }
