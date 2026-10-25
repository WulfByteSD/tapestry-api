import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import { RollHandler, CreateRollData } from '../handlers/Roll.handler';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';
import { AdvFilters } from '../../../../utils/advFilter/AdvFilters';

/**
 * RollService
 *
 * Handles HTTP request/response for dice roll tracking.
 * Extends CRUDService to leverage existing pagination/filtering.
 */
export default class RollService extends CRUDService {
  private rollHandler: RollHandler;

  constructor() {
    super(RollHandler);
    this.rollHandler = this.handler as RollHandler;

    // Define searchable fields for keyword queries
    this.queryKeys = ['expression', 'context', 'aspectUsed', 'rollType'];

    // All endpoints require authentication
    this.requiresAuth = {
      create: true,
      getResources: true,
      getResource: true,
    };
  }

  /**
   * Create a new dice roll
   *
   * POST /api/v1/game/rolls
   *
   * Request body supports three modes:
   * 1. Edge roll:     { edge: true, faces: 6, ... }
   * 2. Burden roll:   { burden: true, faces: 6, ... }
   * 3. Custom roll:   { diceCount: 5, faces: 6, keepBest: 4, ... }
   *
   * Body: {
   *   characterId?: string | null,
   *
   *   // Semantic flags (Tapestry game rules)
   *   edge?: boolean,           // Auto: 4d6, keep best 3
   *   burden?: boolean,         // Auto: 4d6, keep worst 3
   *
   *   // Explicit parameters (for custom rolls)
   *   diceCount?: number,
   *   faces: number,
   *   keepBest?: number,
   *   keepWorst?: number,
   *   operations?: Array<{operator: string, value: number}>,
   *
   *   // Metadata
   *   rollType?: string,
   *   context?: string,
   *   aspectUsed?: string
   * }
   */
  createRoll = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Validate authentication
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Find player profile for the authenticated user
    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any);
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    // inside createRoll:
    const { characterId, campaignId, edge, burden, diceCount, faces, keepBest, keepWorst, operations, rollType, context, aspectUsed, attack } = req.body;

    const rollData: CreateRollData = {
      characterId: characterId ?? null,
      campaignId,
      playerId: playerProfile._id.toString(),
      edge,
      burden,
      diceCount,
      faces,
      keepBest,
      keepWorst,
      operations,
      rollType: rollType || 'custom',
      context,
      aspectUsed,
      attack,
    };

    try {
      // Execute roll through handler
      const result = await this.rollHandler.createRoll(rollData);

      return res.status(201).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error('Roll creation failed:', err);
      return error(err, req, res);
    }
  });

  public getResources = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?._id) return res.status(401).json({ error: 'Authentication required' });
      const player = await PlayerModel.findOne({ user: user._id } as any);
      if (!player) return res.status(403).json({ error: 'Player profile not found' });
      const requestedPage = Number(req.query.pageNumber);
      const requestedLimit = Number(req.query.pageLimit);
      const page = Number.isFinite(requestedPage) ? Math.min(1_000_000, Math.max(1, Math.floor(requestedPage) || 1)) : 1;
      const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit) || 10)) : 10;
      const query = [
        ...AdvFilters.query(this.queryKeys, req.query.keyword as string),
        ...AdvFilters.filter(req.query.includeOptions as string),
      ].filter((entry) => Object.keys(entry).length > 0);
      const [result] = await this.rollHandler.fetchAccessible(player._id.toString(), {
        filters: AdvFilters.filter(req.query.filterOptions as string),
        sort: AdvFilters.sort((req.query.sortOptions as string) || '-createdAt'),
        query,
        page,
        limit,
      }, req.query.campaignId);
      const totalCount = result.metadata[0]?.totalCount || 0;
      return res.status(200).json({
        success: true,
        payload: result.entries,
        metadata: { page, pages: Math.ceil(totalCount / limit), totalCount, prevPage: page - 1, nextPage: page + 1 },
      });
    } catch (err) {
      return error(err, req, res);
    }
  };
}
