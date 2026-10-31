import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import RollLogModel, { RollLogType } from '../model/RollLog';
import CharacterModel from '../model/CharacterModel';
import { eventBus } from '../../../../lib/eventBus';
import DiceRollerService from '../../utils/diceRoller/DiceRollerService';
import { DiceRollParams } from '../../utils/diceRoller/types/DiceRollerTypes';
import { CRUDHandler, PaginationOptions } from '../../../../utils/baseCRUD';
import CampaignModel from '../../campaigns/model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import { resolveAttackOutcome } from '../../rules';
import { prepareDiscordRollDelivery } from '../../campaigns/handlers/DiscordRollDelivery.handler';
import { accessibleSceneIds } from '../../encounters/utils/sceneAccess';

export interface CreateRollData {
  characterId?: string | null;
  playerId: string;
  campaignId?: string | null;

  diceCount?: number;
  faces: number;

  edge?: boolean;
  burden?: boolean;

  keepBest?: number;
  keepWorst?: number;
  operations?: Array<{ operator: '+' | '-' | '*' | '/'; value: number }>;

  rollType?: string;
  context?: string;
  aspectUsed?: string;

  attack?: {
    targetNumber: number;
    targetLabel?: string;
    weaponInstanceId?: string | null;
    itemKey?: string | null;
    weaponNameSnapshot?: string;
    attackProfileKey?: string | null;
    attackNameSnapshot?: string | null;
  };
}

export interface RollResult {
  rollId: mongoose.Types.ObjectId;
  expression: string;
  allRolls: number[];
  keptRolls: number[];
  total: number;
  breakdown?: string;
  attack?: {
    targetNumber: number;
    margin: number;
    outcome: 'miss' | 'weak_hit' | 'hit' | 'strong_hit';
    targetLabel?: string;
    weaponInstanceId?: string | null;
    itemKey?: string | null;
    weaponNameSnapshot?: string;
    attackProfileKey?: string | null;
    attackNameSnapshot?: string | null;
  };
}

export class RollHandler extends CRUDHandler<RollLogType> {
  private roller: DiceRollerService;

  constructor() {
    super(RollLogModel as any);
    this.roller = new DiceRollerService();
  }

  async createRoll(data: CreateRollData): Promise<RollResult> {
    if (!Number.isInteger(data.faces) || data.faces < 2 || data.faces > 1000) {
      throw new ErrorUtil('Dice faces must be a whole number from 2 to 1000', 400);
    }
    if (((!data.edge && !data.burden) || data.diceCount !== undefined) && (!Number.isInteger(data.diceCount) || data.diceCount! < 1 || data.diceCount! > 100)) {
      throw new ErrorUtil('Dice count must be a whole number from 1 to 100', 400);
    }
    if (data.context != null && (typeof data.context !== 'string' || data.context.length > 2000)) {
      throw new ErrorUtil('Roll context must be text of at most 2000 characters', 400);
    }
    if (
      data.operations != null &&
      (!Array.isArray(data.operations) ||
        data.operations.length > 20 ||
        data.operations.some(
          (operation) => !operation || !['+', '-', '*', '/'].includes(operation.operator) || !Number.isFinite(operation.value) || Math.abs(operation.value) > 1_000_000
        ))
    ) {
      throw new ErrorUtil('Roll operations must contain finite modifiers', 400);
    }
    for (const [label, id] of [
      ['Character', data.characterId],
      ['Campaign', data.campaignId],
    ]) {
      if (id != null && (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) {
        throw new ErrorUtil(`${label} ID is invalid`, 400);
      }
    }
    let character;
    if (data.characterId) {
      character = await CharacterModel.findById(data.characterId);

      if (!character) {
        throw new ErrorUtil('Character not found', 404);
      }

      if (character.player.toString() !== data.playerId) {
        throw new ErrorUtil('You do not own this character', 403);
      }

      if (!data.campaignId && character.campaign) {
        data.campaignId = character.campaign.toString();
      }
    }

    let deliveryCampaign: { id: string; name: string } | null = null;
    if (data.campaignId) {
      const campaign = await CampaignModel.findById(data.campaignId);
      if (!campaign) throw new ErrorUtil('Campaign not found', 404);
      const isOwner = campaign.owner.toString() === data.playerId;
      const member = campaign.members.find((entry) => entry.player.toString() === data.playerId);
      if (!isOwner && !member) throw new ErrorUtil('You are not a member of this campaign', 403);
      if (!isOwner && member?.role === 'observer') throw new ErrorUtil('Observers cannot roll in this campaign', 403);
      if (campaign.status === 'archived') throw new ErrorUtil('Archived campaigns are read-only', 403);
      if (character && (character.campaign?.toString() !== data.campaignId || character.status !== 'active')) {
        throw new ErrorUtil('Choose an active character attached to this campaign', 403);
      }
      deliveryCampaign = { id: data.campaignId, name: campaign.name };
    }

    const rollParams: DiceRollParams = {
      diceCount: data.diceCount || 0,
      faces: data.faces,
      edge: data.edge,
      burden: data.burden,
      keepBest: data.keepBest,
      keepWorst: data.keepWorst,
      operations: data.operations,
    };

    const rollResult = await this.roller.rollAdvanced(rollParams);

    if (rollResult.error) {
      throw new ErrorUtil(`Dice roll failed: ${rollResult.error}`, 400);
    }

    const attackResolution =
      data.rollType === 'attack' && data.attack
        ? {
            ...resolveAttackOutcome(rollResult.total, data.attack.targetNumber),
            targetLabel: data.attack.targetLabel,
            weaponInstanceId: data.attack.weaponInstanceId || null,
            itemKey: data.attack.itemKey || null,
            weaponNameSnapshot: data.attack.weaponNameSnapshot,
            attackProfileKey: data.attack.attackProfileKey || null,
            attackNameSnapshot: data.attack.attackNameSnapshot || null,
          }
        : undefined;

    const discordDelivery = await prepareDiscordRollDelivery(deliveryCampaign, data.playerId, character?.name);
    const rollLog = await RollLogModel.create({
      character: data.characterId || null,
      player: data.playerId,
      campaign: data.campaignId || null,
      expression: rollResult.expression,
      allRolls: rollResult.allRolls,
      keptRolls: rollResult.keptRolls,
      total: rollResult.total,
      breakdown: rollResult.breakdown,
      rollType: data.rollType || 'custom',
      context: data.context,
      aspectUsed: data.aspectUsed,
      attack: attackResolution ?? null,
      rolledAt: new Date(),
      ...(discordDelivery ? { discordDelivery } : {}),
    });

    try {
      await eventBus.publish('game.dice.rolled', {
        rollId: rollLog._id,
        characterId: data.characterId,
        playerId: data.playerId,
        campaignId: data.campaignId,
        total: rollResult.total,
        rollType: data.rollType,
        attackOutcome: attackResolution?.outcome,
      });
    } catch (error: any) {
      console.error('Failed to publish dice roll event:', error);
    }

    return {
      rollId: rollLog._id,
      expression: rollResult.expression,
      allRolls: rollResult.allRolls,
      keptRolls: rollResult.keptRolls,
      total: rollResult.total,
      breakdown: rollResult.breakdown,
      attack: attackResolution,
    };
  }

  async fetchAll(options: PaginationOptions) {
    const results = await super.fetchAll(options);
    // Aggregations bypass schema select:false; delivery internals are not roll API fields.
    for (const result of results) for (const entry of result.entries) delete entry.discordDelivery;
    return results;
  }

  async fetchAccessible(playerId: string, options: PaginationOptions, campaignId?: unknown) {
    const player = new mongoose.Types.ObjectId(playerId);
    const allowedScenes=await accessibleSceneIds(playerId,typeof campaignId==='string'&&mongoose.Types.ObjectId.isValid(campaignId)?campaignId:undefined);
    options={...options,filters:[{$or:[{sceneVisibility:{$ne:'private'}},{scene:{$in:allowedScenes}}]},...options.filters]};
    if (campaignId !== undefined) {
      if (typeof campaignId !== 'string' || !/^[a-f\d]{24}$/i.test(campaignId)) throw new ErrorUtil('Campaign ID is invalid', 400);
      const campaign = await CampaignModel.findOne({ _id: campaignId, $or: [{ owner: player }, { 'members.player': player }] } as any)
        .select('_id')
        .lean();
      if (!campaign) throw new ErrorUtil('Campaign not found or no longer accessible', 403);
      const results = await this.fetchAll({ ...options, filters: [{ campaign: new mongoose.Types.ObjectId(campaignId) }, ...options.filters] });
      return Promise.all(
        results.map(async (result) => {
          const [players, characters] = await Promise.all([
            PlayerModel.find({ _id: { $in: result.entries.map((entry) => entry.player).filter(Boolean) } })
              .select('displayName avatar')
              .lean(),
            CharacterModel.find({ _id: { $in: result.entries.map((entry) => entry.character).filter(Boolean) } })
              .select('name')
              .lean(),
          ]);
          const playerNames = new Map(players.map((entry) => [entry._id.toString(), entry]));
          const characterNames = new Map(characters.map((entry) => [entry._id.toString(), entry.name]));
          return {
            ...result,
            entries: result.entries.map((entry) => ({
              ...entry,
              playerDisplayName: playerNames.get(entry.player?.toString())?.displayName ?? null,
              playerAvatar: playerNames.get(entry.player?.toString())?.avatar ?? null,
              characterName: entry.actorNameSnapshot ?? (entry.character ? (characterNames.get(entry.character.toString()) ?? null) : null),
            })),
          };
        })
      );
    }
    const campaigns = await CampaignModel.find({ $or: [{ owner: player }, { 'members.player': player }] } as any).distinct('_id');
    return this.fetchAll({
      ...options,
      // Keep access separate from caller filters; include/keyword options can only narrow it.
      filters: [{ $or: [{ player }, { campaign: { $in: campaigns } }] }, ...options.filters],
    });
  }
}
