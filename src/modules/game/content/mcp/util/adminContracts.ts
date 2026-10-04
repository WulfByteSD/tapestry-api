import { z } from 'zod';
import { CAPABILITIES, CONTENT_TYPES } from '../types/McpTypes';
import { operationIdSchema } from './contentContracts';

const id = z.string().regex(/^[a-fA-F0-9]{24}$/);
/** Redirects must be exact HTTPS callbacks or explicit loopback callbacks for local OAuth clients. */
const callback = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && !url.hash && !value.includes('*') &&
    (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
}, 'Use an exact HTTPS or loopback callback.');
export const clientCreateSchema = z.strictObject({ operationId: operationIdSchema, clientId: z.string().min(1).max(128).optional(),
  name: z.string().trim().min(1).max(100), kind: z.enum(['interactive', 'machine']), confidential: z.boolean(),
  redirectUris: z.array(callback).max(10).default([]) }).refine(c => c.kind === 'interactive' ? c.redirectUris.length > 0 : c.confidential && c.redirectUris.length === 0,
  'Interactive clients need callbacks; machine clients must be confidential and have no callbacks.');
export const clientUpdateSchema = z.strictObject({ operationId: operationIdSchema, name: z.string().trim().min(1).max(100).optional(),
  redirectUris: z.array(callback).max(10).optional(), isActive: z.boolean().optional() });
const capabilities = z.array(z.enum(CAPABILITIES)).min(1).max(CAPABILITIES.length).refine(c => c.includes('read'), 'Every grant must include read access.');
const restrictions = { capabilities: capabilities.default(['read', 'propose']), contentTypes: z.array(z.enum(CONTENT_TYPES)).min(1).max(CONTENT_TYPES.length),
  settingKeys: z.array(z.string().trim().min(1).max(128).refine(k => k !== 'shared', 'Use shared: true for shared content.')).max(100), shared: z.boolean().default(false),
  expiresAt: z.string().datetime().refine(v => new Date(v).getTime() > Date.now(), 'Expiry must be in the future.') };
export const grantCreateSchema = z.strictObject({ operationId: operationIdSchema, clientId: z.string().min(1).max(128), ownerId: id, ...restrictions });
export const grantUpdateSchema = z.strictObject({ operationId: operationIdSchema, ...Object.fromEntries(Object.entries(restrictions).map(([key, value]) => [key, value.optional()])), isActive: z.boolean().optional() });
export const reviewSchema = z.strictObject({ operationId: operationIdSchema, note: z.string().max(10000).default('') });
export const operationOnlySchema = z.strictObject({ operationId: operationIdSchema });
export const paginationSchema = z.strictObject({ page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(50).default(25), state: z.enum(['pending', 'applied', 'rejected']).optional() });
