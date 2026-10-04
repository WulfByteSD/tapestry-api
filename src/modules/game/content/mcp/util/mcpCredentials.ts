import crypto from 'crypto';
import mongoose from 'mongoose';

/** Generate a 256-bit opaque credential suitable for codes, tokens, secrets, and browser intents. */
export const opaque = () => crypto.randomBytes(32).toString('base64url');
/** Store irreversible hashes rather than raw random credentials or operation payloads. */
export const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
/** Canonicalize records and operation payloads so revisions and retry hashes are deterministic. */
export function stable(value: any): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value instanceof mongoose.Types.ObjectId) return JSON.stringify(String(value));
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
    .join(',')}}`;
}
/** Hash the complete persisted record so nested edits and lore side effects invalidate stale reads. */
export const revision = (doc: any) => digest(stable(doc));
/** Compare a presented opaque secret against its stored SHA-256 hash in constant time. */
export function equalSecret(value: string, hash?: string | null): boolean {
  return !!hash && /^[a-f0-9]{64}$/.test(hash) && crypto.timingSafeEqual(Buffer.from(digest(value), 'hex'), Buffer.from(hash, 'hex'));
}
