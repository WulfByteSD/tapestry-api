import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { CRUDHandler, PaginationOptions } from '../../../../utils/baseCRUD';
import CharacterModel, { CharacterType } from '../model/CharacterModel';
import { eventBus } from '../../../../lib/eventBus';
import { applyCharacterRules } from '../../rules';
import calculateCharacterProtection from '../../rules/combat/calculateCharacterProtection';
import { validateAndApplyGrowthRules, validateResourceTracks, patchPaths, explicitHPMax } from '../helpers/characterGrowth';
import { initializeWeaveGrowth, applyWeaveGrowth, applyManualGrowthEdits } from '../helpers/characterWeaveGrowth';
import { parse, manualGrowthBaseInput } from '../helpers/progressionContracts';
import { revokeSceneAccess } from '../../encounters/utils/revokeSceneAccess';
import { purseSnapshot, assertPursePatchUnchanged } from '../helpers/characterPurse';
import { createPurseAudit, notifyPurseUpdated, PurseAuditContext, saveWithPurseCapacityAudit, withPurseTransaction } from '../helpers/pursePersistence';

export class CharacterHandler extends CRUDHandler<CharacterType> {
  constructor() {
    super(CharacterModel);
  }

  protected async beforeCreate(data: any): Promise<void> {
    assertPursePatchUnchanged({ sheet: { purse: { baseCapacity: 3, marks: 0 } } }, data);
    if (patchPaths(data).some(path => /^sheet\.(advancementHistory|weaveGrowth|progressionReceipts)(\.|$)/.test(path))) throw new ErrorUtil('Weave growth and history are recorded by the guided flow.', 400);
    // Validate that player reference exists
    if (!data.player) {
      throw new ErrorUtil('Player reference is required', 400);
    }

    if (data.sheet) {
      data.sheet.advancementHistory = [];
      data.sheet.baseHP ??= 12;
      data.sheet.weaveLevel ??= 0;
      if (!Number.isSafeInteger(data.sheet.weaveLevel) || data.sheet.weaveLevel < 0) throw new ErrorUtil('Weave must be a nonnegative whole number.', 400);
    }

    // Apply game rules (aspect validation, HP calculation, threads enforcement)
    // Character creation should have full sheet structure
    try {
      if (data.sheet) {
        // Extract sheet data for rule validation
        const sheetData = {
          aspects: data.sheet.aspects,
          baseHP: data.sheet.baseHP,
          hpAdjustment: data.sheet.hpAdjustment,
          houseRuleOverride: data.sheet.houseRuleOverride,
          threadCapacity: data.sheet.resources?.threads?.max ?? 3,
          hp: { current: 0, max: 0, temp: 0, ...data.sheet.resources?.hp },
          threads: { current: 0, max: 3, temp: 0, ...data.sheet.resources?.threads },
          dtn: data.sheet.dtn || 10, // default DTN if not provided
        };

        // Apply rules
        validateResourceTracks({ resources: { hp: sheetData.hp, threads: sheetData.threads } });
        applyCharacterRules(sheetData as any);

        // Apply calculated values back
        if (!data.sheet.resources) {
          data.sheet.resources = {};
        }
        data.sheet.resources.hp = sheetData.hp;
        data.sheet.resources.threads = sheetData.threads;
        data.sheet.dtn = sheetData.dtn;
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

  protected async beforeUpdate(_id: string, data: any): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(data, 'sheet') && (!data.sheet || typeof data.sheet !== 'object' || Array.isArray(data.sheet))) throw new ErrorUtil('Character sheet updates must contain an object.', 400);
    // Prevent changing the player owner
    const paths = patchPaths(data);
    if (paths.some(path => /^(player|_id|__v|createdAt|updatedAt)(\.|$)/.test(path) || /^sheet\.(advancementHistory|weaveGrowth|progressionReceipts)(\.|$)/.test(path) || path.startsWith('$'))) {
      throw new ErrorUtil('Ownership, revision, and advancement history cannot be edited directly.', 400);
    }
  }

  /**
   * Override update to handle partial updates with rule validation
   * Uses unit of work pattern: Fetch -> Apply Changes -> Validate Rules -> Save
   * This ensures rules are validated against the complete character state after applying partial updates
   */
  async update(id: string, data: any, actor?: Pick<PurseAuditContext, 'actorId' | 'actorName'>): Promise<CharacterType | null> {
    await this.beforeUpdate(id, data);

    // Fetch the existing character document
    const character = await this.Schema.findById(id);
    if (!character) {
      throw new ErrorUtil('Character not found', 404);
    }

    initializeWeaveGrowth(character);
    applyWeaveGrowth(character);
    validateAndApplyGrowthRules(character);
    const beforePurse = purseSnapshot(character);
    assertPursePatchUnchanged(character, data);
    const paths = patchPaths(data);
    const manualBase = data.manualGrowthBase === undefined ? undefined : parse(manualGrowthBaseInput, data.manualGrowthBase);
    const requestedBaseHP = data['sheet.baseHP'] !== undefined ? data['sheet.baseHP'] : data.sheet?.baseHP;
    if (requestedBaseHP !== undefined && (!Number.isSafeInteger(requestedBaseHP) || requestedBaseHP < 0)) throw new ErrorUtil('Base HP must be a nonnegative whole number.', 400);
    const touchesHealth = paths.some(key => ['sheet', 'sheet.resources', 'sheet.aspects', 'sheet.aspects.might'].includes(key) || /^sheet\.(resources\.hp|conditions|aspects\.might\.strength|hpAdjustment|baseHP)(\.|$)/.test(key) || /^manualGrowthBase\.(hpMax|aspects\.might\.strength)(\.|$)/.test(key));
    if(touchesHealth){
      const baseline=data.expectedHealthState;
      const current=JSON.parse(JSON.stringify({hp:character.sheet.resources.hp,conditions:character.sheet.conditions}));
      const stable=(value:any):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((out:any,k)=>{out[k]=v[k];return out;},{}):v);
      if(!baseline||stable(baseline)!==stable(current))throw new ErrorUtil('Character health changed. Reload the sheet before saving health or conditions.',409);
    }
    delete data.expectedHealthState;
    delete data.manualGrowthBase;

    const previousSheet = character.toObject({ flattenMaps: true }).sheet;
    const previousAdjustment = character.sheet.hpAdjustment;
    const previousBaseHP = character.sheet.baseHP;
    const previousHistory = character.sheet.advancementHistory;
    const previousGrowth = character.sheet.weaveGrowth;
    const previousReceipts = character.sheet.progressionReceipts;
    const hadOverrides = character.sheet.houseRuleOverride;
    // Apply partial updates to the document
    // Mongoose's set() method handles dot notation (e.g., 'sheet.aspects.might.strength': 3)
    for (const [key, value] of Object.entries(data)) {
      character.set(key, value);
    }

    character.sheet.advancementHistory = previousHistory;
    character.sheet.weaveGrowth = previousGrowth;
    character.sheet.progressionReceipts = previousReceipts;
    character.sheet.purse = { baseCapacity: beforePurse.baseCapacity, marks: beforePurse.marks };
    character.sheet.hpAdjustment ??= previousAdjustment;
    if (data['sheet.baseHP'] === undefined && data.sheet?.baseHP === undefined) character.sheet.baseHP = previousBaseHP;
    if (data['sheet.houseRuleOverride'] === undefined && data.sheet?.houseRuleOverride === undefined) character.sheet.houseRuleOverride = hadOverrides;
    const requestedMax = explicitHPMax(data);
    if (requestedMax !== undefined) {
      if (!Number.isSafeInteger(requestedMax) || Number(requestedMax) < 0) throw new ErrorUtil('Maximum HP must be a nonnegative whole number.', 400);
      character.sheet.hpAdjustment = Number(requestedMax) - character.sheet.baseHP! - character.sheet.aspects.might.strength;
    }
    applyManualGrowthEdits(character, previousSheet, manualBase);
    if (hadOverrides && !character.sheet.houseRuleOverride) {
      const scores = ['might', 'finesse', 'wit', 'resolve'].flatMap(group => Object.values((character.sheet.aspects as any)[group] ?? {}));
      if (scores.some((value: any) => typeof value === 'number' && (value < -2 || value > 4))) {
        throw new ErrorUtil('Correct Aspects to -2 through +4 before disabling house-rule overrides.', 400);
      }
    }
    validateAndApplyGrowthRules(character);
    character.set('sheet.resources.other.armor', calculateCharacterProtection(character));

    // Save the document (single DB write)
    let updated;
    try { updated = await saveWithPurseCapacityAudit(character, beforePurse, { actorId: String(character.player), ...actor, source: 'manual_weave' }); }
    catch (error: any) {
      if (error?.name === 'VersionError' || error?.code === 112 || error?.hasErrorLabel?.('TransientTransactionError')) throw new ErrorUtil('Character changed. Reload before saving again.', 409);
      throw error;
    }

    // convert to plain object and apply any necessary transformations before returning
    const updatedObj = updated.toObject({
      flattenMaps: true,
      minimize: false,
      getters: false,
      virtuals: false,
      versionKey: true,
    });

    await this.afterUpdate(updatedObj);
    if (beforePurse.capacity !== purseSnapshot(updated).capacity) await notifyPurseUpdated(updated);
    return updatedObj;
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
      if(character.campaign)await revokeSceneAccess(String(character.campaign),String(character.player),characterId);
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
  async forkCharacter(characterId: string, copyAllData: boolean, actor?: Pick<PurseAuditContext, 'actorId' | 'actorName'>): Promise<CharacterType> {
    try {
      const originalCharacter = await this.Schema.findById(characterId);
      if (!originalCharacter) {
        throw new ErrorUtil('Character not found', 404);
      }
      purseSnapshot(originalCharacter);

      // Create a plain object copy
      const characterData: any = originalCharacter.toObject();

      // Remove fields that shouldn't be copied
      // if copyAllData is false, we will also clear aspects, inventory, conditions, note cards, and learned abilities to create a "blank" character with the same profile
      const { _id, createdAt, updatedAt, __v, ...dataToKeep } = characterData;

      if (!copyAllData) {
        dataToKeep.sheet = {
          ...dataToKeep.sheet,
          aspects: { might: { strength: 0, presence: 0 }, finesse: { agility: 0, charm: 0 }, wit: { instinct: 0, knowledge: 0 }, resolve: { willpower: 0, empathy: 0 } },
          hpAdjustment: 0,
          baseHP: 12,
          houseRuleOverride: false,
          advancementHistory: [],
          weaveGrowth: undefined,
          progressionReceipts: [],
          purse: { baseCapacity: 3, marks: 0 },
          resources: { hp: { current: 12, max: 12, temp: 0 }, threads: { current: 1, max: 3, temp: 0 }, other: {} },
          features: [],
          dtn: 10,
          inventory: [],
          conditions: [],
          skills: {},
          noteCards: [],
          learnedAbilities: [],
          // explicitly set settingKey to undefined to prevent accidentally copying setting-specific data to a new character that might be used in a different setting
          weaveLevel: 0, // reset weave level for new character, as this is often tied to progression and we want forks to start fresh in that regard
        };
        dataToKeep.settingKey = undefined; // prevent copying setting association for a forked character, as they may want to use it in a different setting
      }

      // Set fork reference and clear campaign (forked characters start without a campaign)
      const forkedData = {
        ...dataToKeep,
        forkedFrom: originalCharacter._id as any,
        campaign: null,
        name: `${originalCharacter.name} (Copy)`,
      };

      // Create the new character
      const forkedCharacter = copyAllData ? await withPurseTransaction(async session => {
        const [copy] = await this.Schema.create([forkedData], { session });
        await createPurseAudit(copy, purseSnapshot(copy), { actorId: String(copy.player), ...actor, action: 'copy_origin', source: 'character_copy', requestId: 'origin', dedupeKey: 'copy_origin' }, session);
        return copy;
      }) : await this.Schema.create(forkedData);

      // Emit event for tracking
      eventBus.publish('game.character.forked', {
        originalId: originalCharacter._id,
        forkedId: forkedCharacter._id,
        playerId: forkedCharacter.player,
      });

      return forkedCharacter;
    } catch (error) {
      console.log(error);
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

      initializeWeaveGrowth(character);
      applyWeaveGrowth(character);
      validateAndApplyGrowthRules(character);
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
