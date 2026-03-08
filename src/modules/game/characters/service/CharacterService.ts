import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { CRUDService } from '../../../../utils/baseCRUD';
import { CharacterHandler } from '../handlers/Character.handler';
import CharacterModel from '../model/CharacterModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';

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
}
