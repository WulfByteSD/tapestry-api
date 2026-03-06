import mongoose from "mongoose";
import { ErrorUtil } from "../../../../middleware/ErrorUtil";
import RollLogModel, { RollLogType } from "../model/RollLog";
import CharacterModel from "../model/CharacterModel";
import { eventBus } from "../../../../lib/eventBus";
import DiceRollerService from "../../utils/diceRoller/DiceRollerService";
import { DiceRollParams } from "../../utils/diceRoller/types/DiceRollerTypes";
import { CRUDHandler } from "../../../../utils/baseCRUD";
import { resolveAttackOutcome } from "../../rules";

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
  operations?: Array<{ operator: "+" | "-" | "*" | "/"; value: number }>;

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
    outcome: "miss" | "weak_hit" | "hit" | "strong_hit";
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
    super(RollLogModel as mongoose.Model<RollLogType>);
    this.roller = new DiceRollerService();
  }

  async createRoll(data: CreateRollData): Promise<RollResult> {
    if (data.characterId) {
      const character = await CharacterModel.findById(data.characterId);

      if (!character) {
        throw new ErrorUtil("Character not found", 404);
      }

      if (character.player.toString() !== data.playerId) {
        throw new ErrorUtil("You do not own this character", 403);
      }

      if (!data.campaignId && character.campaign) {
        data.campaignId = character.campaign.toString();
      }
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
      data.rollType === "attack" && data.attack
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

    const rollLog = await RollLogModel.create({
      character: data.characterId || null,
      player: data.playerId,
      campaign: data.campaignId || null,
      expression: rollResult.expression,
      allRolls: rollResult.allRolls,
      keptRolls: rollResult.keptRolls,
      total: rollResult.total,
      breakdown: rollResult.breakdown,
      rollType: data.rollType || "custom",
      context: data.context,
      aspectUsed: data.aspectUsed,
      attack: attackResolution ?? null,
      rolledAt: new Date(),
    });

    try {
      eventBus.publish("game.dice.rolled", {
        rollId: rollLog._id,
        characterId: data.characterId,
        playerId: data.playerId,
        campaignId: data.campaignId,
        total: rollResult.total,
        rollType: data.rollType,
        attackOutcome: attackResolution?.outcome,
      });
    } catch (error: any) {
      console.error("Failed to publish dice roll event:", error);
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
}