import { z } from 'zod';

const common = {
  requestId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  expectedRevision: z.number().int().safe().nonnegative(),
  note: z.string().trim().max(4000).default(''),
};
const amount = z.number().int().safe().positive();
export const purseChangeInput = z.discriminatedUnion('action', [
  z.object({ ...common, action: z.literal('mark'), amount }).strict(),
  z.object({ ...common, action: z.literal('clear'), amount }).strict(),
  z.object({ ...common, action: z.literal('clear_all') }).strict(),
  z.object({ ...common, action: z.literal('set_base_capacity'), baseCapacity: z.number().int().safe().nonnegative() }).strict(),
]);
export const purseQueryInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(300).optional(),
}).strict();
