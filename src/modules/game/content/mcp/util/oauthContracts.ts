import { z } from 'zod';
import { CAPABILITIES } from '../types/McpTypes';

/** Browser authorization parameters are validated before any callback is trusted or consent is displayed. */
export const authorizationSchema = z.strictObject({
  client_id: z.string().min(1).max(128), redirect_uri: z.string().url().max(2048),
  response_type: z.literal('code'), resource: z.string().url(),
  state: z.string().min(1).max(1024), scope: z.string().max(500).optional(),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code_challenge_method: z.literal('S256'),
});
/** Accept only supported OAuth flows and known scalar parameters. The library checks grant-specific requirements. */
export const tokenSchema = z.strictObject({
  grant_type: z.enum(['authorization_code', 'client_credentials', 'refresh_token']), resource: z.string().url(),
  client_id: z.string().max(128).optional(), client_secret: z.string().max(512).optional(),
  code: z.string().max(512).optional(), redirect_uri: z.string().url().max(2048).optional(),
  code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).optional(),
  refresh_token: z.string().max(512).optional(), scope: z.string().max(500).optional(),
});
/** Declining needs only the bound consent intent; account credentials are required only for approval. */
export const consentSchema = z.discriminatedUnion('decision', [
  z.strictObject({ intent: z.string().max(128), csrf: z.string().max(128),
    email: z.string().email().max(254), password: z.string().min(1).max(256), decision: z.literal('approve') }),
  z.strictObject({ intent: z.string().max(128), csrf: z.string().max(128),
    email: z.string().max(254).optional(), password: z.string().max(256).optional(), decision: z.literal('deny') }),
]);

/** Parse requested scopes independently from client names and other untrusted metadata. */
export function requestedScopes(scope?: string): string[] {
  const scopes = scope?.split(' ').filter(Boolean) || ['read', 'propose'];
  z.array(z.enum(CAPABILITIES)).min(1).max(CAPABILITIES.length).parse(scopes);
  return [...new Set(scopes)];
}
