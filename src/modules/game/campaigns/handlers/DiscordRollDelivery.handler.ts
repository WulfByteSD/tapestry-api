import { randomUUID } from 'crypto';
import RollLogModel, { DiscordRollDelivery } from '../../characters/model/RollLog';
import CampaignModel from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import { DiscordConnectionModel } from '../model/DiscordIntegrationModel';
import DiscordDeliveryGate from '../model/DiscordDeliveryGateModel';
import { DiscordBotError, discordBotRequest } from '../utils/discordBotClient';
import { discordRollMessage } from '../utils/discordRollMessage';

const GATE_ID = 'campaign-rolls';
const LEASE_MS = 120000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const UNCERTAIN = 'Discord may have received this roll. Check the mapped channel; it will not be sent again automatically.';

/** Called before the roll insert; only database reads, and every failure is terminal. */
export async function prepareDiscordRollDelivery(campaign: { id: string; name: string } | null, playerId: string, characterName?: string): Promise<DiscordRollDelivery | undefined> {
  if (!campaign) return undefined;
  const createdAt = new Date();
  try {
    const connection = await DiscordConnectionModel.findOne({ campaign: campaign.id }).lean();
    if (!connection?.mappings?.rolls) return undefined;
    const player = await PlayerModel.findById(playerId).select('displayName').lean();
    if (!connection.updatedAt || !connection.guildId || !connection.mappings.rolls.discordChannelId) throw new Error('Invalid mapping');
    return {
      state: 'pending', connectionId: connection._id, mappingRevision: connection.updatedAt,
      guildId: connection.guildId, channelId: connection.mappings.rolls.discordChannelId,
      campaignName: campaign.name, playerName: player?.displayName, characterName,
      createdAt, nextAttemptAt: createdAt, attempts: 0,
    };
  } catch {
    // No later lookup/backfill: a failed preparation must never broadcast to a future mapping.
    return { state: 'failed', createdAt, finishedAt: createdAt, attempts: 0, lastError: 'Discord delivery could not be prepared. This roll remains saved in Tapestry and will not be sent automatically.' };
  }
}

export async function initializeDiscordRollDelivery(): Promise<void> {
  await DiscordDeliveryGate.createIndexes();
  try {
    await DiscordDeliveryGate.updateOne({ _id: GATE_ID }, { $setOnInsert: { leaseUntil: new Date(0), cooldownUntil: new Date(0) } }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

export async function processNextDiscordRoll(): Promise<void> {
  const token = randomUUID();
  const now = new Date();
  const gate = await DiscordDeliveryGate.findOneAndUpdate({ _id: GATE_ID, leaseUntil: { $lte: now }, cooldownUntil: { $lte: now } }, {
    $set: { token, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  }, { returnDocument: 'after' }).lean();
  if (!gate) return;
  try {
    // A process may have died after Discord accepted the POST. Never blindly replay it.
    await RollLogModel.updateMany({ 'discordDelivery.state': 'sending', 'discordDelivery.leaseUntil': { $lte: now } }, {
      $set: { 'discordDelivery.state': 'uncertain', 'discordDelivery.lastError': UNCERTAIN, 'discordDelivery.finishedAt': now },
      $unset: { 'discordDelivery.claimToken': 1, 'discordDelivery.leaseUntil': 1 },
    });
    const roll = await RollLogModel.findOneAndUpdate({ 'discordDelivery.state': { $in: ['pending', 'retry'] }, 'discordDelivery.nextAttemptAt': { $lte: now } }, {
      $set: { 'discordDelivery.state': 'sending', 'discordDelivery.claimToken': token, 'discordDelivery.leaseUntil': new Date(now.getTime() + LEASE_MS) },
      $inc: { 'discordDelivery.attempts': 1 },
    }, { returnDocument: 'after', sort: { 'discordDelivery.nextAttemptAt': 1, _id: 1 } }).select('+discordDelivery').lean();
    if (!roll?.discordDelivery) return;
    const delivery = roll.discordDelivery;
    const claim = { _id: roll._id, 'discordDelivery.state': 'sending', 'discordDelivery.claimToken': token };
    const settle = async (state: DiscordRollDelivery['state'], fields: Record<string, unknown> = {}) => {
      const values: Record<string, unknown> = { 'discordDelivery.state': state };
      for (const [key, value] of Object.entries(fields)) values[`discordDelivery.${key}`] = value;
      if (state !== 'retry') values['discordDelivery.finishedAt'] = new Date();
      await RollLogModel.updateOne(claim, { $set: values, $unset: { 'discordDelivery.claimToken': 1, 'discordDelivery.leaseUntil': 1 } });
    };
    const cooldown = async (ms: number) => {
      if (ms > 0) await DiscordDeliveryGate.updateOne({ _id: GATE_ID, token }, { $max: { cooldownUntil: new Date(Date.now() + ms) } });
    };
    const mapped = async () => {
      if (!delivery.connectionId || !delivery.mappingRevision || !delivery.guildId || !delivery.channelId || !roll.campaign) return false;
      const [campaign, connection] = await Promise.all([
        CampaignModel.exists({ _id: roll.campaign, status: { $ne: 'archived' } }),
        DiscordConnectionModel.exists({ _id: delivery.connectionId, campaign: roll.campaign, guildId: delivery.guildId, updatedAt: delivery.mappingRevision, 'mappings.rolls.discordChannelId': delivery.channelId }),
      ]);
      return Boolean(campaign && connection);
    };
    const retry = async (ms: number, message: string) => {
      const nextAttemptAt = new Date(Date.now() + ms);
      if (delivery.attempts >= MAX_ATTEMPTS || nextAttemptAt.getTime() - delivery.createdAt.getTime() > MAX_AGE_MS) {
        await settle('failed', { lastError: 'Discord delivery stopped after its retry window. The roll remains saved in Tapestry.' });
      } else await settle('retry', { nextAttemptAt, lastError: message });
    };
    let postStarted = false;
    try {
      if (!await mapped()) { await settle('cancelled', { lastError: 'Delivery cancelled because the campaign or its Discord mapping changed.' }); return; }
      if (Date.now() - delivery.createdAt.getTime() > MAX_AGE_MS || delivery.attempts > MAX_ATTEMPTS) { await settle('failed', { lastError: 'The Discord delivery window expired. This roll will not be sent automatically.' }); return; }
      const channel = await discordBotRequest<{ id: string; guild_id: string; type: number }>(`/channels/${delivery.channelId}`);
      if (channel.data.id !== delivery.channelId || channel.data.guild_id !== delivery.guildId || channel.data.type !== 0) { await settle('cancelled', { lastError: 'The Discord destination is no longer the mapped server text channel.' }); return; }
      // A successful GET exhausted its own route bucket, not the message POST bucket.
      // Pace later claims while allowing this already-validated delivery to complete.
      if (channel.cooldownMs) await cooldown(channel.cooldownMs);
      // Recheck after upstream work and immediately before sending to the captured destination.
      if (!await mapped()) { await settle('cancelled', { lastError: 'Delivery cancelled because the campaign or its Discord mapping changed.' }); return; }
      const checkTime = new Date();
      const leaseUntil = new Date(checkTime.getTime() + LEASE_MS);
      const ownedRoll = await RollLogModel.updateOne({ ...claim, 'discordDelivery.leaseUntil': { $gt: checkTime } }, { $set: { 'discordDelivery.leaseUntil': leaseUntil } });
      if (!ownedRoll.matchedCount) return;
      // Last awaited operation before POST: an expired gate owner must not send.
      const ownedGate = await DiscordDeliveryGate.updateOne({ _id: GATE_ID, token, leaseUntil: { $gt: new Date() } }, { $set: { leaseUntil } });
      if (!ownedGate.matchedCount || Date.now() + 15000 >= leaseUntil.getTime()) return;
      postStarted = true;
      const response = await discordBotRequest<{ id: string }>(`/channels/${delivery.channelId}/messages`, discordRollMessage(roll));
      if (!/^\d{17,20}$/.test(response.data.id ?? '')) throw new DiscordBotError('unavailable', 'Discord returned no message confirmation.');
      await settle('sent', { messageId: response.data.id, sentAt: new Date(), lastError: '' });
      await cooldown(response.cooldownMs);
    } catch (error) {
      if (error instanceof DiscordBotError && error.kind === 'rate_limit') {
        await cooldown(error.retryAfterMs);
        await retry(error.retryAfterMs, error.message);
      } else if (error instanceof DiscordBotError && error.kind === 'permanent') {
        await settle('failed', { lastError: error.message });
      } else if (postStarted) {
        await settle('uncertain', { lastError: UNCERTAIN });
      } else {
        await retry(Math.min(60000, 2000 * 2 ** delivery.attempts), 'Discord delivery could not be checked. Waiting before trying again.');
      }
    }
  } finally {
    await DiscordDeliveryGate.updateOne({ _id: GATE_ID, token }, { $set: { leaseUntil: new Date(0) }, $unset: { token: 1 } });
  }
}
