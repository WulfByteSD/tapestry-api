import { ErrorUtil } from '../../../../middleware/ErrorUtil';

export type DiscordGuild = { id: string; name: string; owner_id: string; owner?: boolean; permissions?: string };
type Role = { id: string; permissions: string };
type Member = { roles: string[]; communication_disabled_until?: string | null };
type Overwrite = { id: string; type: number; allow: string; deny: string };
export type DiscordChannel = { id: string; guild_id: string; name: string; type: number; permission_overwrites?: Overwrite[] };
const ADMIN = BigInt(8);
const MANAGE_GUILD = BigInt(32);
const REQUIRED = [
  ['View Channel', BigInt(1024)], ['Send Messages', BigInt(2048)],
  ['Read Message History', BigInt(65536)], ['Embed Links', BigInt(16384)],
] as const;

export function discordSettings() {
  const { DISCORD_APPLICATION_ID: applicationId, DISCORD_CLIENT_SECRET: clientSecret, DISCORD_BOT_TOKEN: botToken, DISCORD_REDIRECT_URI: redirectUri } = process.env;
  if (!applicationId || !clientSecret || !botToken || !redirectUri) throw new ErrorUtil('Discord connection is not configured on this server yet.', 503);
  let url: URL;
  try { url = new URL(redirectUri); } catch { throw new ErrorUtil('Discord redirect configuration is invalid.', 503); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new ErrorUtil('Discord redirect configuration is invalid.', 503);
  }
  return { applicationId, clientSecret, botToken, redirectUri };
}

export async function discordRequest<T>(path: string, authorization: string | null, body?: URLSearchParams): Promise<T> {
  let response: globalThis.Response;
  try {
    response = await fetch(`https://discord.com/api/v10${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body, signal: AbortSignal.timeout(10000),
    });
  } catch { throw new ErrorUtil('Discord could not be reached. Try again shortly.', 502); }
  if (!response.ok) {
    if (response.status === 429) throw new ErrorUtil('Discord is receiving too many requests. Wait a moment and try again.', 429);
    if ([403, 404].includes(response.status)) throw new ErrorUtil('Discord server or channel is unavailable. Check membership and bot permissions.', 403);
    if ([400, 401].includes(response.status)) throw new ErrorUtil('Discord authorization failed. Authorize again or check the application configuration.', 400);
    throw new ErrorUtil('Discord is temporarily unavailable. Try again shortly.', 502);
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; } catch { throw new ErrorUtil('Discord returned an unexpected response.', 502); }
}

export function mayManage(guild: DiscordGuild) {
  const permissions = BigInt(guild.permissions ?? '0');
  return guild.owner || Boolean(permissions & (ADMIN | MANAGE_GUILD));
}

function basePermissions(guildId: string, roles: Role[], member: Member) {
  return roles.filter((role) => role.id === guildId || member.roles.includes(role.id)).reduce((value, role) => value | BigInt(role.permissions), BigInt(0));
}

export async function liveGuildAccess(guildId: string, discordUserId: string) {
  const botAuth = `Bot ${discordSettings().botToken}`;
  const [guild, roles, member, bot] = await Promise.all([
    discordRequest<DiscordGuild>(`/guilds/${guildId}`, botAuth),
    discordRequest<Role[]>(`/guilds/${guildId}/roles`, botAuth),
    discordRequest<Member>(`/guilds/${guildId}/members/${discordUserId}`, botAuth),
    discordRequest<{ id: string }>('/users/@me', botAuth),
  ]);
  if (guild.owner_id !== discordUserId && !(basePermissions(guildId, roles, member) & (ADMIN | MANAGE_GUILD))) {
    throw new ErrorUtil('You need Manage Server permission in this Discord server.', 403);
  }
  const botMember = await discordRequest<Member>(`/guilds/${guildId}/members/${bot.id}`, botAuth);
  return { guild, roles, botMember, botId: bot.id, botAuth };
}

export async function liveChannels(access: Awaited<ReturnType<typeof liveGuildAccess>>) {
  const { guild, roles, botMember, botId, botAuth } = access;
  const channels = await discordRequest<DiscordChannel[]>(`/guilds/${guild.id}/channels`, botAuth);
  return channels.filter((channel) => channel.type === 0 && channel.guild_id === guild.id).map((channel) => {
    let permissions = basePermissions(guild.id, roles, botMember);
    if (guild.owner_id === botId || permissions & ADMIN) return { id: channel.id, name: channel.name, available: true };
    const overwrites = channel.permission_overwrites ?? [];
    const everyone = overwrites.find((entry) => entry.type === 0 && entry.id === guild.id);
    if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
    const roleOverwrites = overwrites.filter((entry) => entry.type === 0 && botMember.roles.includes(entry.id));
    const deny = roleOverwrites.reduce((value, entry) => value | BigInt(entry.deny), BigInt(0));
    const allow = roleOverwrites.reduce((value, entry) => value | BigInt(entry.allow), BigInt(0));
    permissions = (permissions & ~deny) | allow;
    const memberOverwrite = overwrites.find((entry) => entry.type === 1 && entry.id === botId);
    if (memberOverwrite) permissions = (permissions & ~BigInt(memberOverwrite.deny)) | BigInt(memberOverwrite.allow);
    const missing = REQUIRED.filter(([, permission]) => !(permissions & permission)).map(([name]) => name);
    if (botMember.communication_disabled_until && Date.parse(botMember.communication_disabled_until) > Date.now()) missing.push('Send Messages');
    return { id: channel.id, name: channel.name, available: missing.length === 0, ...(missing.length ? { reason: `Bot needs: ${[...new Set(missing)].join(', ')}` } : {}) };
  }).sort((left, right) => left.name.localeCompare(right.name));
}
