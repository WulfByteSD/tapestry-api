import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { CRUDService } from '../../../../utils/baseCRUD';
import { CharacterHandler } from '../handlers/Character.handler';
import CharacterModel from '../model/CharacterModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { AdvFilters } from '../../../../utils/advFilter/AdvFilters';
import { buildEffectiveAbilities } from '../helpers/buildEffectiveAbilities';

type CharacterInput = {
  player: string;
  campaign?: string;
  setting?: string;
  name: string;
  // TODO: Add character sheet fields once schema is finalized
};

export default class CharacterService extends CRUDService {
  private characterHandler: CharacterHandler;

  constructor() {
    super(CharacterHandler);
    this.characterHandler = this.handler as CharacterHandler;
    this.queryKeys = ['name', 'setting'];
    this.requiresAuth = {
      create: true,
      getResources: true,
      getResource: true,
      updateResource: true,
      removeResource: true,
    };
  }

  /**
   * Hook: before creating a character, set the player reference
   */
  protected async beforeCreate(data: any): Promise<void> {
    // Find the player profile for the authenticated user
    const playerProfile = await PlayerModel.findOne({ user: data.user });
    if (!playerProfile) {
      throw new Error('Player profile not found for user');
    }

    // Set the player reference
    data.player = playerProfile._id;
  }

  /**
   * Hook: before fetching all, filter by player ownership for regular players
   */
  protected async beforeFetchAll(options: any): Promise<void> {
    // TODO: Implement role-based filtering once authentication is wired up
    // Regular players should only see their own characters
    // Storyweavers can see all characters (for campaign management)
  }

  /**
   * Join a character to a campaign
   */
  joinCampaign = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: characterId } = req.params;
    const { campaignId } = req.body;

    if (!characterId) {
      return res.status(400).json({ error: 'Character ID is required' });
    }

    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    // Find player profile for ownership verification
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    // Verify character ownership
    const character = await CharacterModel.findById(characterId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.player.toString() !== playerProfile._id.toString()) {
      return res.status(403).json({ error: 'You do not own this character' });
    }

    const updatedCharacter = await this.characterHandler.joinCampaign(characterId, campaignId);

    res.status(200).json(updatedCharacter);
  });

  /**
   * Remove character from their current campaign
   */
  leaveCampaign = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: characterId } = req.params;

    if (!characterId) {
      return res.status(400).json({ error: 'Character ID is required' });
    }

    // Find player profile for ownership verification
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    // Verify character ownership
    const character = await CharacterModel.findById(characterId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.player.toString() !== playerProfile._id.toString()) {
      return res.status(403).json({ error: 'You do not own this character' });
    }

    const updatedCharacter = await this.characterHandler.leaveCampaign(characterId);

    res.status(200).json(updatedCharacter);
  });

  /**
   * Fork/duplicate a character
   */
  forkCharacter = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: characterId } = req.params;

    if (!characterId) {
      return res.status(400).json({ error: 'Character ID is required' });
    }

    // Find player profile for ownership verification
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    // Verify character ownership
    const character = await CharacterModel.findById(characterId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.player.toString() !== playerProfile._id.toString()) {
      return res.status(403).json({ error: 'You can only fork your own characters' });
    }

    const forkedCharacter = await this.characterHandler.forkCharacter(characterId);

    res.status(201).json(forkedCharacter);
  });

  /**
   * Apply harm/damage to a character
   */
  applyHarm = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: characterId } = req.params;
      const { incomingHarm: harm, applyToTemp = true } = req.body;
      if (!characterId) {
        return res.status(400).json({ error: 'Character ID is required' });
      }

      if (typeof harm !== 'number' || harm < 0) {
        return res.status(400).json({ error: 'Valid harm value is required' });
      }

      // Find player profile for ownership verification
      const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
      if (!playerProfile) {
        return res.status(403).json({ error: 'Player profile not found' });
      }

      // Verify character ownership
      const character = await CharacterModel.findById(characterId);
      if (!character) {
        return res.status(404).json({ error: 'Character not found' });
      }

      if (character.player.toString() !== playerProfile._id.toString()) {
        return res.status(403).json({ error: 'You do not own this character' });
      }

      // Apply harm through handler
      const result = await this.characterHandler.applyHarm(characterId, harm, applyToTemp);

      res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error('Error applying harm:', err);
      error(err, req, res);
    }
  });

  private async enrichCharacterPayload(character: any) {
    if (!character) return character;

    const effectiveAbilities = await buildEffectiveAbilities({
      learnedAbilities: character?.sheet?.learnedAbilities ?? [],
      inventory: character?.sheet?.inventory ?? [],
    });

    return {
      ...character,
      derived: {
        ...(character?.derived ?? {}),
        effectiveAbilities,
      },
    };
  }

  private async enrichCharacterListPayload(characters: any[]) {
    return await Promise.all((characters ?? []).map((entry) => this.enrichCharacterPayload(entry)));
  }

  public getResource = asyncHandler(async (req: Request, res: Response, next: any): Promise<Response> => {
    try {
      this.ensureAuthenticated(req as AuthenticatedRequest, 'getResource');

      await this.beforeFetch(req.params.id as any);

      const result = await this.handler.fetch(req.params.id);
      await this.afterFetch(result);

      if (!result) {
        return res.status(404).json({ message: 'Resource Not found' });
      }

      const payload = await this.enrichCharacterPayload(result);

      return res.status(200).json({
        success: true,
        payload,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  }) as any;

  public getResources = asyncHandler(async (req: Request, res: Response, next: any): Promise<Response> => {
    try {
      this.ensureAuthenticated(req as AuthenticatedRequest, 'getResources');

      const pageSize = Number(req.query?.pageLimit) || 10;
      const page = Number(req.query?.pageNumber) || 1;

      const keywordQuery = AdvFilters.query(this.queryKeys, req.query?.keyword as string);
      const filterIncludeOptions = AdvFilters.filter(req.query?.includeOptions as string);

      const orConditions = [
        ...(Object.keys(keywordQuery[0]).length > 0 ? keywordQuery : []),
        ...(Array.isArray(filterIncludeOptions) && filterIncludeOptions.length > 0 && Object.keys(filterIncludeOptions[0]).length > 0 ? filterIncludeOptions : []),
      ];

      await this.beforeFetchAll({
        filters: AdvFilters.filter(req.query?.filterOptions as string),
        sort: AdvFilters.sort((req.query?.sortOptions as string) || '-createdAt'),
        query: orConditions,
        page,
        limit: pageSize,
      });

      const [result] = await this.handler.fetchAll({
        filters: AdvFilters.filter(req.query?.filterOptions as string),
        sort: AdvFilters.sort((req.query?.sortOptions as string) || '-createdAt'),
        query: orConditions,
        page,
        limit: pageSize,
      });

      await this.afterFetchAll(result);

      const payload = await this.enrichCharacterListPayload(result.entries ?? []);

      return res.status(200).json({
        success: true,
        payload,
        metadata: {
          page,
          pages: Math.ceil(result.metadata[0]?.totalCount / pageSize) || 0,
          totalCount: result.metadata[0]?.totalCount || 0,
          prevPage: page - 1,
          nextPage: page + 1,
        },
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  }) as any;

  public updateResource = asyncHandler(async (req: Request, res: Response, next: any): Promise<Response> => {
    try {
      this.ensureAuthenticated(req as AuthenticatedRequest, 'updateResource');

      await this.beforeUpdate(req.params.id as string, req.body);

      const result = await this.handler.update(req.params.id, req.body);

      await this.afterUpdate(result);

      const payload = await this.enrichCharacterPayload(result);

      return res.status(201).json({
        success: true,
        payload,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  }) as any;
}
