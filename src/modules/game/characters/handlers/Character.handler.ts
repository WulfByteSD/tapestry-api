import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { CRUDHandler, PaginationOptions } from '../../../../utils/baseCRUD';
import CharacterModel, { CharacterType } from '../model/CharacterModel';
import { eventBus } from '../../../../lib/eventBus';
import { applyCharacterRules } from '../../rules';
import calculateCharacterProtection from '../../rules/combat/calculateCharacterProtection';

export class CharacterHandler extends CRUDHandler<CharacterType> {
  constructor() {
    super(CharacterModel);
  }

  protected async beforeCreate(data: any): Promise<void> {
    // Validate that player reference exists
    if (!data.player) {
      throw new ErrorUtil('Player reference is required', 400);
    }

    // Apply game rules (aspect validation, HP calculation, threads enforcement)
    // Character creation should have full sheet structure
    try {
      if (data.sheet) {
        // Extract sheet data for rule validation
        const sheetData = {
          aspects: data.sheet.aspects,
          hp: data.sheet.resources?.hp || { current: 0, max: 0, temp: 0 },
          threads: data.sheet.resources?.threads || { current: 0, max: 0, temp: 0 },
        };

        // Apply rules
        applyCharacterRules(sheetData as any);

        // Apply calculated values back
        if (!data.sheet.resources) {
          data.sheet.resources = {};
        }
        data.sheet.resources.hp = sheetData.hp;
        data.sheet.resources.threads = sheetData.threads;
      }
    } catch (error) {
      throw new ErrorUtil(error instanceof Error ? error.message : 'Character validation failed', 400);
    }

    // TODO: Validate setting if provided (check against SettingsRegistry)
  }

  protected async afterCreate(doc: CharacterType): Promise<void> {
    try {
      // Emit event for player stats update
      eventBus.publish('game.character.created', {
        characterId: doc._id,
        playerId: doc.player,
      });
    } catch (error) {
      console.error('Failed to publish character creation event:', error);
      // Don't throw - character was created successfully
    }
  }

  protected async beforeUpdate(id: string, data: any): Promise<void> {
    // Prevent changing the player owner
    if (data.player) {
      throw new ErrorUtil('Cannot change character owner', 400);
    }
  }

  /**
   * Override update to handle partial updates with rule validation
   * Uses unit of work pattern: Fetch -> Apply Changes -> Validate Rules -> Save
   * This ensures rules are validated against the complete character state after applying partial updates
   */
  async update(id: string, data: any): Promise<CharacterType | null> {
    await this.beforeUpdate(id, data);

    // Fetch the existing character document
    const character = await this.Schema.findById(id);
    if (!character) {
      throw new ErrorUtil('Character not found', 404);
    }

    // Apply partial updates to the document
    // Mongoose's set() method handles dot notation (e.g., 'sheet.aspects.might.strength': 3)
    for (const [key, value] of Object.entries(data)) {
      character.set(key, value);
    }

    // Apply game rules to the character's sheet
    // This validates aspects, recalculates HP based on strength, and enforces threads range
    try {
      // Extract sheet data for rule validation (rules expect flat structure)
      const sheetData = {
        aspects: character.sheet.aspects,
        hp: character.sheet.resources.hp,
        threads: character.sheet.resources.threads,
      };

      // Apply rules (validates and calculates)
      applyCharacterRules(sheetData as any);

      // Apply the rule calculations back to the document
      character.sheet.resources.hp = sheetData.hp;
      character.sheet.resources.threads = sheetData.threads;
    } catch (error) {
      throw new ErrorUtil(error instanceof Error ? error.message : 'Character validation failed', 400);
    }

    // Save the document (single DB write)
    const updated = await character.save();

    await this.afterUpdate(updated);
    return updated;
  }

  /**
   * Add a character to a campaign
   * Verifies the character's player is a member of the campaign
   */
  async joinCampaign(characterId: string, campaignId: string): Promise<CharacterType> {
    try {
      const character = await this.Schema.findById(characterId);
      if (!character) {
        throw new ErrorUtil('Character not found', 404);
      }

      // Import CampaignModel to verify membership
      const CampaignModel = (await import('../../campaigns/model/CampaignModel')).default;
      const campaign = await CampaignModel.findById(campaignId);
      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }

      // Verify character's player is a member of the campaign
      const isMember = campaign.members.some((member) => member.player.toString() === character.player.toString());
      if (!isMember) {
        throw new ErrorUtil('Character owner must be a member of the campaign', 403);
      }

      // Update character's campaign reference
      character.campaign = campaign._id as any;
      await character.save();

      // Emit event for tracking
      eventBus.publish('game.character.joined_campaign', {
        characterId: character._id,
        campaignId: campaign._id,
        playerId: character.player,
      });

      return character;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to add character to campaign', 500);
    }
  }

  /**
   * Remove a character from a campaign
   */
  async leaveCampaign(characterId: string): Promise<CharacterType> {
    try {
      const character = await this.Schema.findById(characterId);
      if (!character) {
        throw new ErrorUtil('Character not found', 404);
      }

      const previousCampaign = character.campaign;
      character.campaign = null;
      await character.save();

      // Emit event for tracking
      if (previousCampaign) {
        eventBus.publish('game.character.left_campaign', {
          characterId: character._id,
          campaignId: previousCampaign,
          playerId: character.player,
        });
      }

      return character;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to remove character from campaign', 500);
    }
  }

  /**
   * Fork a character (create a copy)
   * Sets forkedFrom reference to original character
   */
  async forkCharacter(characterId: string): Promise<CharacterType> {
    try {
      const originalCharacter = await this.Schema.findById(characterId);
      if (!originalCharacter) {
        throw new ErrorUtil('Character not found', 404);
      }

      // Create a plain object copy
      const characterData: any = originalCharacter.toObject();

      // Remove fields that shouldn't be copied
      const { _id, createdAt, updatedAt, __v, ...dataToKeep } = characterData;

      // Set fork reference and clear campaign (forked characters start without a campaign)
      const forkedData = {
        ...dataToKeep,
        forkedFrom: originalCharacter._id as any,
        campaign: null,
        name: `${originalCharacter.name} (Copy)`,
      };

      // Create the new character
      const forkedCharacter = await this.Schema.create(forkedData);

      // Emit event for tracking
      eventBus.publish('game.character.forked', {
        originalId: originalCharacter._id,
        forkedId: forkedCharacter._id,
        playerId: forkedCharacter.player,
      });

      return forkedCharacter;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to fork character', 500);
    }
  }

  async fetchAll(options: PaginationOptions): Promise<{ entries: CharacterType[]; metadata: any[] }[]> {
    try {
      return await this.Schema.aggregate([
        {
          $match: {
            $and: [...options.filters],
            ...(options.query.length > 0 && { $or: options.query }),
          },
        },
        {
          $sort: options.sort,
        },
        {
          $facet: {
            metadata: [{ $count: 'totalCount' }, { $addFields: { page: options.page, limit: options.limit } }],
            entries: [
              { $skip: (options.page - 1) * options.limit },
              { $limit: options.limit },
              {
                $lookup: {
                  from: 'players',
                  localField: 'player',
                  foreignField: '_id',
                  as: 'playerProfile',
                },
              },
              {
                $unwind: {
                  path: '$playerProfile',
                  preserveNullAndEmptyArrays: true,
                },
              },
            ],
          },
        },
      ]);
    } catch (error) {
      throw new ErrorUtil('Failed to fetch characters', 500);
    }
  }

  async fetchSingle(id: string): Promise<CharacterType | null> {
    try {
      const character = await this.Schema.findById(id).populate('player', 'displayName avatar');

      if (!character) {
        throw new ErrorUtil('Character not found', 404);
      }

      return character;
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to fetch character', 500);
    }
  }

  /**
   * Apply harm/damage to a character
   * Calculates protection, applies damage to temp HP first (if requested), then current HP
   */
  async applyHarm(
    characterId: string,
    incomingHarm: number,
    applyToTemp: boolean = true
  ): Promise<{
    incomingHarm: number;
    protection: number;
    appliedHarm: number;
    hpBefore: number;
    hpAfter: number;
    tempBefore: number;
    tempAfter: number;
  }> {
    try {
      const character = await this.Schema.findById(characterId);
      if (!character) {
        throw new ErrorUtil('Character not found', 404);
      }

      // Calculate total protection using the existing combat rule
      const totalProtection = calculateCharacterProtection(character);

      // Compute reduced harm after protection
      const reducedHarm = Math.max(0, incomingHarm - totalProtection);

      // Store initial values for response
      const hpBefore = character.sheet.resources.hp.current;
      const tempBefore = character.sheet.resources.hp.temp || 0;
      let remainingHarm = reducedHarm;

      // Apply to temp HP first if requested and available
      if (applyToTemp && tempBefore > 0) {
        const tempDamage = Math.min(tempBefore, remainingHarm);
        character.sheet.resources.hp.temp = tempBefore - tempDamage;
        remainingHarm -= tempDamage;
      }

      // Apply remaining harm to current HP
      character.sheet.resources.hp.current = Math.max(0, hpBefore - remainingHarm);

      // Persist changes
      await character.save();

      // Emit event for tracking
      eventBus.publish('game.character.harm_applied', {
        characterId: character._id,
        playerId: character.player,
        harm: reducedHarm,
        protection: totalProtection,
      });

      return {
        incomingHarm,
        protection: totalProtection,
        appliedHarm: reducedHarm,
        hpBefore,
        hpAfter: character.sheet.resources.hp.current,
        tempBefore,
        tempAfter: character.sheet.resources.hp.temp || 0,
      };
    } catch (error) {
      if (error instanceof ErrorUtil) throw error;
      throw new ErrorUtil('Failed to apply harm', 500);
    }
  }
}
