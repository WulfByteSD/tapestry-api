import { MCP_PATH, McpConfig } from '../types/McpTypes';

/** Read the opt-in MCP configuration and reject unsafe public URLs or wildcard allowlists. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): McpConfig | null {
  if (env.CONTENT_MCP_ENABLED !== 'true') return null;
  const resource = new URL(env.CONTENT_MCP_URL || '');
  if (resource.protocol !== 'https:' || resource.pathname !== MCP_PATH || resource.search || resource.hash || resource.username || resource.password) {
    throw new Error(`CONTENT_MCP_URL must be an HTTPS URL ending in ${MCP_PATH}.`);
  }
  const hosts = (env.CONTENT_MCP_HOSTS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const origins = (env.CONTENT_MCP_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!hosts.length || !hosts.includes(resource.host.toLowerCase()) || hosts.some((h) => h.includes('*') || h.includes('/') || h.includes('@')))
    throw new Error('CONTENT_MCP_HOSTS must explicitly allow the canonical host (including its port).');
  if (
    !origins.length ||
    origins.some((o) => {
      const u = new URL(o);
      return u.protocol !== 'https:' || u.origin !== o;
    })
  )
    throw new Error('CONTENT_MCP_ORIGINS must contain exact HTTPS origins.');
  return { resource: resource.href, origin: resource.origin, hosts, origins: [...new Set([...origins, resource.origin])] };
}
