import express, { Request, Response } from 'express';
import PlayerService from '../service/PlayerService';
import { AuthMiddleware } from '../../../../middleware/AuthMiddleware';
import { RolesConfig } from '../../../../utils/RolesConfig';
import asyncHandler from '../../../../middleware/asyncHandler';

const router = express.Router();

const service = new PlayerService();

router.route('/health').get((req, res) => {
  res.status(200).json({
    message: 'Player profile service is up and running',
    success: true,
  });
});

// Public route: Get all storyweavers (for LFG, matchmaking)
router.route('/storyweavers').get(
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await PlayerService.getStoryweavers(page, limit);

    res.status(200).json({
      success: true,
      data: result.profiles,
      pagination: result.pagination,
    });
  })
);

// Authenticated routes
router.use(AuthMiddleware.protect);

// Standard CRUD operations
router.route('/').post(service.create).get(service.getResources);

router.route('/:id').get(service.getResource).put(service.updateResource).delete(service.removeResource);

// Special route: Promote player to storyweaver
router.route('/:id/promote-storyweaver').patch(
  asyncHandler(async (req: Request, res: Response) => {
    const profileId = req.params.id;

    // Check if user owns this profile or is an admin
    const profile = await PlayerService.addStoryweaverRole(profileId);

    res.status(200).json({
      success: true,
      message: 'Successfully promoted to storyweaver',
      data: profile,
    });
  })
);

router.route('/profile/:id').get(service.getResource);

export default router;
