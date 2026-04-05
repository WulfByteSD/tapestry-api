import CampaignActivity from '../model/CampaignActivityModel';
import CharacterModel from '../../characters/model/CharacterModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import RollLog from '../../characters/model/RollLog';

export default class CampaignActivityEventHandler {
  /**
   * Fired when a dice roll is performed. Skips if no campaignId is attached to the roll.
   */
  onDiceRolled = async (event: {
    rollId: string;
    characterId: string | null;
    playerId: string;
    campaignId: string | null;
    total: number;
    rollType: string;
    attackOutcome?: string | null;
  }) => {
    if (!event.campaignId) return;

    try {
      const [rollLog, player, character] = await Promise.all([
        RollLog.findById(event.rollId).lean(),
        PlayerModel.findById(event.playerId).lean(),
        event.characterId ? CharacterModel.findById(event.characterId).lean() : Promise.resolve(null),
      ]);

      if (!rollLog) return;

      const activityType = rollLog.attack ? 'roll.attack' : 'roll.custom';

      const payload: Record<string, any> = {
        rollId: event.rollId,
        expression: rollLog.expression,
        allRolls: rollLog.allRolls,
        keptRolls: rollLog.keptRolls,
        total: rollLog.total,
        breakdown: rollLog.breakdown,
        rollType: rollLog.rollType,
        context: rollLog.context,
        aspectUsed: rollLog.aspectUsed,
      };

      if (rollLog.attack) {
        payload.attack = {
          outcome: rollLog.attack.outcome,
          targetNumber: rollLog.attack.targetNumber,
          margin: rollLog.attack.margin,
          targetLabel: rollLog.attack.targetLabel,
          weaponNameSnapshot: rollLog.attack.weaponNameSnapshot,
          attackNameSnapshot: rollLog.attack.attackNameSnapshot,
          attackProfileKey: rollLog.attack.attackProfileKey,
        };
      }

      await CampaignActivity.create({
        campaign: event.campaignId,
        activityType,
        actor: {
          player: event.playerId,
          playerNameSnapshot: player?.displayName,
          character: event.characterId ?? null,
          characterNameSnapshot: character?.name,
        },
        payload,
      } as any);
    } catch (err) {
      console.error('[CampaignActivity] onDiceRolled error:', err);
    }
  };

  /**
   * Fired when a player joins a campaign.
   */
  onMemberJoined = async (event: { campaignId: string; playerId: string; role: string }) => {
    try {
      const player = await PlayerModel.findById(event.playerId).lean();

      await CampaignActivity.create({
        campaign: event.campaignId,
        activityType: 'campaign.member_joined',
        actor: {
          player: event.playerId,
          playerNameSnapshot: player?.displayName,
        },
        payload: {
          role: event.role,
        },
      } as any);
    } catch (err) {
      console.error('[CampaignActivity] onMemberJoined error:', err);
    }
  };

  /**
   * Fired when a player leaves a campaign.
   */
  onMemberLeft = async (event: { campaignId: string; playerId: string }) => {
    try {
      const player = await PlayerModel.findById(event.playerId).lean();

      await CampaignActivity.create({
        campaign: event.campaignId,
        activityType: 'campaign.member_left',
        actor: {
          player: event.playerId,
          playerNameSnapshot: player?.displayName,
        },
        payload: {},
      } as any);
    } catch (err) {
      console.error('[CampaignActivity] onMemberLeft error:', err);
    }
  };

  /**
   * Fired when a character is approved/attached to a campaign.
   */
  onCharacterAttached = async (event: { campaignId: string; playerId: string; characterId: string }) => {
    try {
      const [player, character] = await Promise.all([PlayerModel.findById(event.playerId).lean(), CharacterModel.findById(event.characterId).lean()]);

      await CampaignActivity.create({
        campaign: event.campaignId,
        activityType: 'campaign.character_attached',
        actor: {
          player: event.playerId,
          playerNameSnapshot: player?.displayName,
          character: event.characterId,
          characterNameSnapshot: character?.name,
        },
        payload: {
          characterId: event.characterId,
          characterNameSnapshot: character?.name,
        },
      } as any);
    } catch (err) {
      console.error('[CampaignActivity] onCharacterAttached error:', err);
    }
  };

  /**
   * Fired when a character is detached from a campaign.
   */
  onCharacterDetached = async (event: { campaignId: string; playerId: string; characterId: string }) => {
    try {
      const [player, character] = await Promise.all([PlayerModel.findById(event.playerId).lean(), CharacterModel.findById(event.characterId).lean()]);

      await CampaignActivity.create({
        campaign: event.campaignId,
        activityType: 'campaign.character_detached',
        actor: {
          player: event.playerId,
          playerNameSnapshot: player?.displayName,
          character: event.characterId,
          characterNameSnapshot: character?.name,
        },
        payload: {
          characterId: event.characterId,
          characterNameSnapshot: character?.name,
        },
      } as any);
    } catch (err) {
      console.error('[CampaignActivity] onCharacterDetached error:', err);
    }
  };
}
