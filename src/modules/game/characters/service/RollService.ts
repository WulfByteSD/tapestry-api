import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import { RollHandler, CreateRollData } from '../handlers/Roll.handler';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';

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

    // Extract dice parameters
    const { characterId, edge, burden, diceCount, faces, keepBest, keepWorst, operations, rollType, context, aspectUsed } = req.body;

    // // Validation: Cannot specify both edge and burden
    // if (edge && burden) {
    //   return res.status(400).json({ error: 'Cannot specify both edge and burden' });
    // }

    // // Validation: Cannot mix semantic flags with explicit keep values
    // if ((edge || burden) && (keepBest || keepWorst)) {
    //   return res.status(400).json({ error: 'Cannot specify edge/burden with explicit keepBest/keepWorst' });
    // }

    // // Validation: faces is always required
    // if (!faces) {
    //   return res.status(400).json({ error: 'faces is required' });
    // }

    // if (typeof faces !== 'number' || faces < 2) {
    //   return res.status(400).json({ error: 'faces must be a number >= 2' });
    // }

    // // Validation: diceCount required for non-edge/burden rolls
    // if (!edge && !burden) {
    //   if (!diceCount) {
    //     return res.status(400).json({ error: 'diceCount is required (unless using edge/burden)' });
    //   }

    //   if (typeof diceCount !== 'number' || diceCount < 1) {
    //     return res.status(400).json({ error: 'diceCount must be a number >= 1' });
    //   }
    // }

    // Build roll data
    const rollData: CreateRollData = {
      characterId: characterId || null,
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
}
