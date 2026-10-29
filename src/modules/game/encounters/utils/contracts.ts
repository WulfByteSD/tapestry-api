import { z } from 'zod';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';

const short = z.string().trim().max(200);

const prose = z.string().max(20000);

const lines = z.array(z.string().max(2000)).max(30);

const tags = z.array(z.string().trim().min(1).max(100)).max(30);

const integer = (min: number) => z.number().int().min(min).max(1000000);

const mediaUrl = z
  .string()
  .max(2048)
  .refine((value) => !value || /^https?:\/\//i.test(value), 'Use an HTTP or HTTPS image URL.');

export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ID.')
  .transform((value) => value.toLowerCase());

export const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const combatantSnapshot = z
  .object({
    name: short.min(1),
    category: z.enum(['npc', 'creature', 'unwoven', 'boss', 'ally', 'hazard']),
    disposition: z.enum(['hostile', 'neutral', 'friendly']),
    tier: short.optional(),
    origin: short.optional(),
    role: short.optional(),
    perks: tags.optional(),
    statline: z.object({ hp: integer(1), defenseTN: integer(1), harm: short.min(1), armor: integer(0), move: short, actions: integer(1), tags }).strict(),
    attacks: z
      .array(z.object({ name: short.min(1), harm: short.min(1), range: short.optional(), notes: z.string().max(2000).optional() }).strict())
      .max(30)
      .optional(),
    abilities: z
      .array(z.object({ name: short.min(1), text: z.string().min(1).max(5000), cooldown: short.optional() }).strict())
      .max(30)
      .optional(),
    loreCheck: z
      .object({
        skill: short.optional(),
        tn: integer(0).optional(),
        villagers: lines.optional(),
        priests: lines.optional(),
        scholars: lines.optional(),
        soldiers: lines.optional(),
      })
      .strict()
      .optional(),
    backgroundBehavior: prose.optional(),
    whereFound: lines.optional(),
    tactics: lines.optional(),
    hooks: lines.optional(),
    notes: z.object({ public: prose.optional(), gm: prose.optional() }).strict().optional(),
    media: z.object({ portraitUrl: mediaUrl.optional(), tokenUrl: mediaUrl.optional(), bannerUrl: mediaUrl.optional() }).strict().optional(),
  })
  .strict()
  .refine((value) => Buffer.byteLength(JSON.stringify(value)) <= 60000, 'Combatant details are too large.');

export type CombatantSnapshot = z.infer<typeof combatantSnapshot>;

// Require canon tiers for authored changes while keeping legacy reads and copies intact.
const authoredCombatantSnapshot = combatantSnapshot.safeExtend({
  tier: z.enum(['I', 'II', 'III', 'IV', 'V'], { error: 'Choose a tier from I to V.' }),
});

export const characterSnapshot = z.object({ name: short.min(1), avatarUrl: mediaUrl.optional(), archetypeKey: short.optional(), weaveLevel: integer(0) }).strict();

export const participant = z.discriminatedUnion('kind', [
  z
    .object({ id: objectId, kind: z.literal('combatant'), provenance: z.object({ kind: z.enum(['catalog', 'personal']), id: objectId }).strict(), snapshot: combatantSnapshot })
    .strict(),
  z.object({ id: objectId, kind: z.literal('character'), provenance: z.object({ kind: z.literal('character'), id: objectId }).strict(), snapshot: characterSnapshot }).strict(),
]);

export type Participant = z.infer<typeof participant>;

export const participants = z
  .array(participant)
  .max(100)
  .refine((value) => new Set(value.map((p) => p.id)).size === value.length, 'Participant IDs must be unique.');

export const createDraft = z.object({ title: short.min(1), notes: prose.optional() }).strict();

export const editDraft = z
  .object({ revision, title: short.min(1).optional(), notes: prose.optional() })
  .strict()
  .refine((value) => value.title !== undefined || value.notes !== undefined, 'Supply a title or notes.');

export const addParticipant = z.object({ revision, source: z.object({ kind: z.enum(['catalog', 'personal', 'character']), id: objectId }).strict() }).strict();

export const editParticipant = z.object({ revision, snapshot: authoredCombatantSnapshot }).strict();

export const revisionOnly = z.object({ revision }).strict();

export const turnOrder = z.object({
  round: integer(1),
  slots: z.array(z.object({ id: objectId, participantId: objectId }).strict()).max(200)
    .refine((slots) => new Set(slots.map((slot) => slot.id)).size === slots.length, 'Turn slot IDs must be unique.'),
  currentSlotId: objectId.nullable(),
}).strict().refine((order) => order.currentSlotId === null || order.slots.some((slot) => slot.id === order.currentSlotId), 'Current turn must reference a turn slot.');

export type TurnOrder = z.infer<typeof turnOrder>;

export const updateTurnOrder = z.discriminatedUnion('action', [
  z.object({ revision, action: z.literal('reorder'), slotIds: z.array(objectId).max(200) }).strict(),
  z.object({ revision, action: z.literal('add'), participantId: objectId }).strict(),
  z.object({ revision, action: z.literal('remove'), slotId: objectId }).strict(),
  z.object({ revision, action: z.literal('select'), slotId: objectId }).strict(),
  z.object({ revision, action: z.literal('advance') }).strict(),
  z.object({ revision, action: z.literal('next-round') }).strict(),
]);
export type TurnOrderCommand = z.infer<typeof updateTurnOrder>;

export const createTemplate = z.object({ snapshot: authoredCombatantSnapshot }).strict();

export const editTemplate = z.object({ revision, snapshot: authoredCombatantSnapshot }).strict();

export const listQuery = z
  .object({
    keyword: z.string().trim().max(100).optional(),
    pageNumber: z.coerce.number().int().min(1).max(100000).default(1),
    pageLimit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ErrorUtil(result.error.issues.map((issue) => `${issue.path.join('.') || 'Request'}: ${issue.message}`).join('; '), 400);
  return result.data;
}

/** Copy only preparation fields. Catalog metadata, visibility and ownership never enter copies. */
export function catalogSnapshot(source: any): CombatantSnapshot {
  const result: Record<string, unknown> = {};
  for (const key of [
    'name',
    'category',
    'disposition',
    'tier',
    'origin',
    'role',
    'perks',
    'statline',
    'attacks',
    'abilities',
    'loreCheck',
    'backgroundBehavior',
    'whereFound',
    'tactics',
    'hooks',
    'notes',
    'media',
  ]) {
    if (source[key] !== undefined) result[key] = JSON.parse(JSON.stringify(source[key]));
  }
  return parse(combatantSnapshot, result);
}
export function displayCharacter(source: any) {
  return parse(characterSnapshot, {
    name: source.name,
    ...(source.avatarUrl && /^https?:\/\//i.test(source.avatarUrl) ? { avatarUrl: source.avatarUrl } : {}),
    ...(source.sheet?.archetypeKey ? { archetypeKey: source.sheet.archetypeKey } : {}),
    weaveLevel: source.sheet?.weaveLevel ?? 0,
  });
}
