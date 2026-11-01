import { z } from 'zod';
import { createHash } from 'crypto';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';

export const aspectKeys = ['might.strength', 'might.presence', 'finesse.agility', 'finesse.charm', 'wit.knowledge', 'wit.instinct', 'resolve.willpower', 'resolve.empathy'] as const;
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const key = z.string().trim().min(1).max(120).regex(/^[a-z0-9_-]+$/i);
// Skill definitions and existing character maps support namespaced and human
// readable keys. Preserve them exactly, while enforcing MongoDB map safety.
const skillKey = z.string().superRefine((value, context) => {
  if (!value.trim() || value.startsWith('$') || value.includes('.') || value.includes('\0') || ['__proto__', 'prototype', 'constructor'].includes(value)) {
    context.addIssue({ code: 'custom', message: `Unsupported Skill key ${JSON.stringify(value)}. Skill keys cannot be blank, contain a period or null character, start with $, or use reserved property names.` });
  }
});
const requestId = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const note = z.string().trim().max(4000).default('');
const choice = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('aspect'), aspect: z.enum(aspectKeys) }).strict(),
  z.object({ kind: z.literal('hp') }).strict(),
  z.object({ kind: z.literal('threads') }).strict(),
  z.object({ kind: z.literal('skill'), skillKey, settingKey: key.optional() }).strict(),
  z.object({ kind: z.literal('ability'), abilityId: objectId, settingKey: key.optional() }).strict(),
  z.object({ kind: z.literal('refineAbility'), abilityId: objectId, refinement: z.string().trim().min(1).max(4000) }).strict(),
]);
export const advanceInput = z.object({ requestId, expectedRevision: z.number().int().nonnegative(), awardId: objectId.optional(), note, choice }).strict();
export const resetInput = z.object({ requestId, expectedRevision: z.number().int().nonnegative() }).strict();
const integer = z.number().int().safe();
const skillRanks = z.preprocess((value, context) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    // Validate the raw keys before z.record can discard a reserved __proto__ key.
    for (const entry of Object.keys(value)) {
      const result = skillKey.safeParse(entry);
      if (!result.success) for (const issue of result.error.issues) context.addIssue({ code: 'custom', path: [entry], message: issue.message });
    }
  }
  return value;
}, z.record(z.string(), integer.nonnegative()));
const aspectPair = (first: string, second: string) => z.object({ [first]: integer.optional(), [second]: integer.optional() }).strict();
export const manualGrowthBaseInput = z.object({
  hpMax: integer.nonnegative().optional(),
  threadCap: integer.nonnegative().optional(),
  aspects: z.object({ might: aspectPair('strength', 'presence').optional(), finesse: aspectPair('agility', 'charm').optional(), wit: aspectPair('instinct', 'knowledge').optional(), resolve: aspectPair('willpower', 'empathy').optional() }).strict().optional(),
  skills: skillRanks.optional(),
  learnedAbilities: z.array(z.object({ abilityId: objectId, abilityKey: key, sourceType: z.literal('learned'), notes: z.string().max(20000).optional(), prepared: z.boolean().optional() }).strict()).optional(),
}).strict();
export const awardInput = z.object({ requestId, characterIds: z.array(objectId).min(1).max(200), note }).strict();
export const resolveInput = z.object({ status: z.enum(['handled_manually', 'dismissed']) }).strict();
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ErrorUtil(result.error.issues.map(issue => issue.message).join(' '), 400);
  return result.data;
}
export function fingerprint(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
