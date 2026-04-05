import { presenceClient } from '../../config/redis';

export interface UserPresence {
  socketId: string;
  userId: string;
  playerId: string;
  displayName: string;
  avatar: string | null;
  connectedAt: Date;
}

// Redis key helpers
const roomKey = (campaignId: string) => `pres:room:${campaignId}`;
const socketKey = (socketId: string) => `pres:socket:${socketId}`;
const SOCKET_KEY_TTL = 86400; // 24 h — crash-safe cleanup

/**
 * Redis-backed presence store.
 *
 * pres:room:<campaignId>   → Hash  { socketId: JSON(UserPresence) }
 * pres:socket:<socketId>   → Set   { campaignId, ... }  (24 h TTL)
 *
 * Multi-tab handling:
 *   - addUser returns true only when this is the FIRST socket for a given userId in a room.
 *   - removeUser returns wasLastConnection=true only when no sockets remain for that userId.
 *   Callers gate presence:user-joined / presence:user-left broadcasts on these flags.
 */
class PresenceStore {
  /**
   * Add a socket connection to the room.
   * @returns true if this is the first socket for this userId in the room (broadcast user-joined)
   */
  async addUser(campaignId: string, presence: UserPresence): Promise<boolean> {
    try {
      // Check if any other socket for this user is already in the room (multi-tab)
      const existing = await presenceClient.hgetall(roomKey(campaignId));
      const isFirst = !Object.values(existing ?? {}).some((raw) => {
        try {
          return (JSON.parse(raw) as UserPresence).userId === presence.userId;
        } catch {
          return false;
        }
      });

      // Store presence entry in the room hash
      await presenceClient.hset(roomKey(campaignId), presence.socketId, JSON.stringify(presence));

      // Track which rooms this socket is in (with TTL for crash safety)
      await presenceClient.sadd(socketKey(presence.socketId), campaignId);
      await presenceClient.expire(socketKey(presence.socketId), SOCKET_KEY_TTL);

      return isFirst;
    } catch (err) {
      console.error('[PresenceStore] addUser error:', err);
      return true; // safe default: treat as first connection so broadcasts fire
    }
  }

  /**
   * Remove a socket connection from the room.
   * @returns wasLastConnection=true when no sockets remain for that userId (broadcast user-left)
   */
  async removeUser(campaignId: string, socketId: string): Promise<{ wasLastConnection: boolean; presence: UserPresence | null }> {
    try {
      const raw = await presenceClient.hget(roomKey(campaignId), socketId);
      const presence: UserPresence | null = raw ? (JSON.parse(raw) as UserPresence) : null;

      await presenceClient.hdel(roomKey(campaignId), socketId);
      await presenceClient.srem(socketKey(socketId), campaignId);

      if (!presence) return { wasLastConnection: true, presence: null };

      // Check if any other sockets for this userId remain
      const remaining = await presenceClient.hgetall(roomKey(campaignId));
      const wasLastConnection = !Object.values(remaining ?? {}).some((r) => {
        try {
          return (JSON.parse(r) as UserPresence).userId === presence.userId;
        } catch {
          return false;
        }
      });

      return { wasLastConnection, presence };
    } catch (err) {
      console.error('[PresenceStore] removeUser error:', err);
      return { wasLastConnection: true, presence: null }; // safe default: fire user-left
    }
  }

  /**
   * Returns one UserPresence entry per unique userId for presence:room-state.
   */
  async getRoomUsers(campaignId: string): Promise<UserPresence[]> {
    try {
      const all = await presenceClient.hgetall(roomKey(campaignId));
      if (!all) return [];

      const seen = new Set<string>();
      const users: UserPresence[] = [];

      for (const raw of Object.values(all)) {
        try {
          const p = JSON.parse(raw) as UserPresence;
          if (!seen.has(p.userId)) {
            seen.add(p.userId);
            users.push(p);
          }
        } catch {
          // skip malformed entries
        }
      }

      return users;
    } catch (err) {
      console.error('[PresenceStore] getRoomUsers error:', err);
      return [];
    }
  }

  /**
   * Returns all campaignIds this socket is currently in — used for disconnect cleanup.
   */
  async getCampaignsForSocket(socketId: string): Promise<string[]> {
    try {
      return await presenceClient.smembers(socketKey(socketId));
    } catch (err) {
      console.error('[PresenceStore] getCampaignsForSocket error:', err);
      return [];
    }
  }
}

export const presenceStore = new PresenceStore();
