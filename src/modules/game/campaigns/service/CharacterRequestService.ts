import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import { CRUDService } from '../../../../utils/baseCRUD';
import { CharacterRequestHandler } from '../handlers/CharacterRequest.handler';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import CampaignModel from '../model/CampaignModel';
import CharacterModel from '../../characters/model/CharacterModel';
import asyncHandler from '../../../../middleware/asyncHandler';

export default class CharacterRequestService extends CRUDService {
  private charRequestHandler: CharacterRequestHandler;

  constructor() {
    super(CharacterRequestHandler);
    this.charRequestHandler = this.handler as CharacterRequestHandler;
    this.queryKeys = ['status', 'campaign', 'player', 'character'];
    this.requiresAuth = {
      create: true,
      getResources: true,
      getResource: true,
      updateResource: true,
      removeResource: true,
    };
  }

  /**
   * Submit a character request for a campaign
   * POST /campaigns/:id/character-requests
   */
  createCharacterRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;
    const { characterId, message } = req.body;

    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) return res.status(403).json({ error: 'Player profile not found' });

    const request = await this.charRequestHandler.createRequest(campaignId as string, playerProfile._id.toString(), characterId, message);

    res.status(201).json(request);
  });

  /**
   * List character requests for a campaign (SW/co-SW only)
   * GET /campaigns/:id/character-requests
   */
  listRequests = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;
    const { status } = req.query;

    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) return res.status(403).json({ error: 'Player profile not found' });

    const campaign = await CampaignModel.findById(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const member = campaign.members.find((m) => m.player.toString() === playerProfile._id.toString());
    const canManage = campaign.owner.toString() === playerProfile._id.toString() || (member && ['sw', 'co-sw'].includes(member.role));
    if (!canManage) return res.status(403).json({ error: 'Only campaign owners and co-storyweavers can view character requests' });

    const requests = await this.charRequestHandler.listRequests(campaignId as string, status as string | undefined);

    res.status(200).json(requests);
  });

  /**
   * Get the authenticated player's character requests for specific campaign
   * GET /campaigns/:id/character-requests/me
   */
  getMyRequests = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;

    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) return res.status(403).json({ error: 'Player profile not found' });

    const requests = await this.charRequestHandler.getPlayerRequests(campaignId as string, playerProfile._id.toString());

    res.status(200).json(requests); 
  });

  /**
   * Approve a character request
   * POST /campaigns/:id/character-requests/:reqId/approve
   */
  approveRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { reqId } = req.params;

    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) return res.status(403).json({ error: 'Player profile not found' });

    const updated = await this.charRequestHandler.approveRequest(reqId as string, playerProfile._id.toString());

    res.status(200).json(updated);
  });

  /**
   * Reject a character request
   * POST /campaigns/:id/character-requests/:reqId/reject
   */
  rejectRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { reqId } = req.params;

    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) return res.status(403).json({ error: 'Player profile not found' });

    const updated = await this.charRequestHandler.rejectRequest(reqId as string, playerProfile._id.toString());

    res.status(200).json(updated);
  });

  /**
   * List all characters attached to a campaign
   * GET /campaigns/:id/characters
   */
  listCampaignCharacters = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;

    const characters = await CharacterModel.find({ campaign: campaignId as any });

    res.status(200).json(characters);
  });

  /**
   * SW directly attaches a character to a campaign (DMPC, no request needed)
   * POST /campaigns/:id/characters
   */
  directAttachCharacter = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;
    const { characterId } = req.body;

    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) return res.status(403).json({ error: 'Player profile not found' });

    const result = await this.charRequestHandler.directAttach(campaignId as string, playerProfile._id.toString(), characterId);

    res.status(200).json(result);
  });

  /**
   * Detach a character from a campaign (dual-clear)
   * DELETE /campaigns/:id/characters/:charId
   */
  detachCharacter = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId, charId } = req.params;

    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) return res.status(403).json({ error: 'Player profile not found' });

    await this.charRequestHandler.detachCharacter(campaignId as string, charId as string, playerProfile._id.toString());

    res.status(204).send();
  });
}
