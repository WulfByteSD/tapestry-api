import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import RollLogModel, { RollLogType } from '../model/RollLog';
import CharacterModel from '../model/CharacterModel';
import { eventBus } from '../../../../lib/eventBus';
import DiceRollerService from '../../utils/diceRoller/DiceRollerService';
import { DiceRollParams } from '../../utils/diceRoller/types/DiceRollerTypes';
import { CRUDHandler } from '../../../../utils/baseCRUD';

export interface CreateRollData {
  characterId?: string | null;
  playerId: string;
  campaignId?: string | null;

  // Dice parameters
  diceCount?: number; // Optional when using edge/burden
  faces: number;

  // Semantic game mechanics (Tapestry rules)
  edge?: boolean; // Edge mechanic: auto-rolls 4d6, keeps best 3
  burden?: boolean; // Burden mechanic: auto-rolls 4d6, keeps worst 3

  // Explicit overrides (for custom scenarios)
  keepBest?: number;
  keepWorst?: number;
  operations?: Array<{ operator: '+' | '-' | '*' | '/'; value: number }>;

  // Metadata
  rollType?: string;
  context?: string;
  aspectUsed?: string;
}

export interface RollResult {
  rollId: mongoose.Types.ObjectId;
  expression: string;
  allRolls: number[];
  keptRolls: number[];
  total: number;
  breakdown?: string;
}

export class RollHandler extends CRUDHandler<RollLogType> {
  private roller: DiceRollerService;

  constructor() {
    super(RollLogModel);
    this.roller = new DiceRollerService();
  }

  /**
   * Create a new dice roll and log it
   *
   * @param data - Roll creation data
   * @returns Roll result with rollId
   */
  async createRoll(data: CreateRollData): Promise<RollResult> {
    // Validate character ownership if characterId provided
    if (data.characterId) {
      const character = await CharacterModel.findById(data.characterId);
      if (!character) {
        throw new ErrorUtil('Character not found', 404);
      }

      // Verify ownership: character.player should match playerId
      if (character.player.toString() !== data.playerId) {
        throw new ErrorUtil('You do not own this character', 403);
      }

      // Use character's campaign if not explicitly provided
      if (!data.campaignId && character.campaign) {
        data.campaignId = character.campaign.toString();
      }
    }

    // Build dice roll parameters
    const rollParams: DiceRollParams = {
      diceCount: data.diceCount || 0, // Will be set by edge/burden if not provided
      faces: data.faces,
      edge: data.edge,
      burden: data.burden,
      keepBest: data.keepBest,
      keepWorst: data.keepWorst,
      operations: data.operations,
    };
 
    const rollResult = await this.roller.rollAdvanced(rollParams); 
    if(rollResult.error) {
      throw new ErrorUtil(`Dice roll failed: ${rollResult.error}`, 400);
    } 

    // Create roll log
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
      rolledAt: new Date(),
    });

    // Emit event for potential side effects (notifications, achievements, etc.)
    try {
      eventBus.publish('game.dice.rolled', {
        rollId: rollLog._id,
        characterId: data.characterId,
        playerId: data.playerId,
        campaignId: data.campaignId,
        total: rollResult.total,
        rollType: data.rollType,
      });
    } catch (error: any) {
      console.error('Failed to publish dice roll event:', error);
      // Don't throw - roll was created successfully
    }

    return {
      rollId: rollLog._id,
      expression: rollResult.expression,
      allRolls: rollResult.allRolls,
      keptRolls: rollResult.keptRolls,
      total: rollResult.total,
      breakdown: rollResult.breakdown,
    };
  }
}
