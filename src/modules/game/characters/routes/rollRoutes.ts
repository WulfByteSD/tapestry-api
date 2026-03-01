import express from 'express';
import RollService from '../service/RollService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';

const router = express.Router();

const service = new RollService();

// Health check
router.route('/health').get((req, res) => {
  res.status(200).json({
    message: 'Roll service is up and running',
    success: true,
  });
});

// All roll routes require authentication
router.use(AuthMiddleware.protect);

/**
 * POST /api/v1/game/rolls
 * Create a new dice roll
 *
 * Supports three roll modes:
 * 1. Edge roll (Tapestry game rule):     4d6, keep best 3
 * 2. Burden roll (Tapestry game rule):   4d6, keep worst 3
 * 3. Custom roll:                        Any diceCount/faces/keep combination
 *
 * Example request bodies:
 *
 * Edge roll:
 * {
 *   "edge": true,
 *   "faces": 6,
 *   "characterId": "64a1b2c3...",
 *   "rollType": "attack",
 *   "context": "Attacking bandit",
 *   "aspectUsed": "might.strength"
 * }
 *
 * Burden roll:
 * {
 *   "burden": true,
 *   "faces": 6,
 *   "characterId": "64a1b2c3..."
 * }
 *
 * Custom roll:
 * {
 *   "diceCount": 5,
 *   "faces": 6,
 *   "keepBest": 4,
 *   "operations": [{"operator": "+", "value": 2}],
 *   "characterId": "64a1b2c3..."
 * }
 */
router.route('/').post(service.createRoll);

/**
 * GET /api/v1/game/rolls
 * Get roll history with filtering and pagination
 *
 * Query params:
 * - filterOptions: character;{id}|campaign;{id}|rollType;{type}
 * - keyword: search in expression, context, aspectUsed, rollType
 * - sortOptions: -rolledAt (default), expression, etc.
 * - pageNumber: 1 (default)
 * - pageLimit: 10 (default)
 */
router.route('/').get(service.getResources);

export default router;
