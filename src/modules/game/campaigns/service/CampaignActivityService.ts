import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import CampaignActivity from '../model/CampaignActivityModel';
import CampaignModel from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import mongoose from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import error from '../../../../middleware/error';

const MAX_NOTE_LENGTH = 500;
const DEFAULT_FEED_LIMIT = 20;

export default class CampaignActivityService {
  /**
   * GET /:id/activity?limit=20&before=<activityId>
   * Returns a paginated activity feed for a campaign.
   * Any authenticated campaign member (or owner) may read the feed.
   */
  getFeed = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;
    const { type } = req.query;
    const pageSize = Number(req.query?.pageLimit) || DEFAULT_FEED_LIMIT;
    const page = Number(req.query?.pageNumber) || 1;

    // Verify campaign exists and requester is a member or owner
    const campaign = await CampaignModel.findById(campaignId).lean();
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any).lean();
    if (!playerProfile) {
      return res.status(403).json({ error: 'Player profile not found' });
    }

    const playerId = playerProfile._id.toString();
    const isOwner = campaign.owner.toString() === playerId;
    const isMember = campaign.members.some((m: any) => m.player.toString() === playerId);

    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'Not a campaign member' });
    }

    const match: Record<string, any> = { campaign: new mongoose.Types.ObjectId(campaignId as string) };
    if (type) {
      match.activityType = type;
    }

    const [result] = await CampaignActivity.aggregate([
      { $match: match },
      { $sort: { _id: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'totalCount' }, { $addFields: { page, limit: pageSize } }],
          entries: [
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
            {
              $lookup: {
                from: 'players',
                localField: 'actor.player',
                foreignField: '_id',
                as: 'actor.player',
                pipeline: [{ $project: { displayName: 1, avatar: 1, _id: 1 } }],
              },
            },
            {
              $unwind: {
                path: '$actor.player',
                preserveNullAndEmptyArrays: true,
              },
            },
          ],
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      payload: result.entries,
      metadata: {
        page,
        pages: Math.ceil(result.metadata[0]?.totalCount / pageSize) || 0,
        totalCount: result.metadata[0]?.totalCount || 0,
        prevPage: page - 1,
        nextPage: page + 1,
      },
    });
  });

  /**
   * POST /:id/activity
   * Storyweaver/co-SW only. Writes a manual sw.note directly (no event).
   */
  postNote = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: campaignId } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new ErrorUtil('Note content is required', 400);
      }

      if (content.length > MAX_NOTE_LENGTH) {
        throw new ErrorUtil(`Note must be ${MAX_NOTE_LENGTH} characters or fewer`, 400);
      }

      const campaign = await CampaignModel.findById(campaignId).lean();
      if (!campaign) {
        throw new ErrorUtil('Campaign not found', 404);
      }

      const playerProfile = await PlayerModel.findOne({ user: req.user._id } as any).lean();
      if (!playerProfile) {
        throw new ErrorUtil('Player profile not found', 403);
      }

      const playerId = playerProfile._id.toString();
      const isOwner = campaign.owner.toString() === playerId;
      const member = campaign.members.find((m: any) => m.player.toString() === playerId);
      const isSW = isOwner || (member && ['sw', 'co-sw'].includes(member.role));

      if (!isSW) {
        throw new ErrorUtil('Only storyweavers may post notes', 403);
      }

      const entry = await CampaignActivity.create({
        campaign: campaignId,
        activityType: 'sw.note',
        actor: {
          player: playerProfile._id,
          playerNameSnapshot: playerProfile.displayName,
        },
        payload: { ...req.body, content: content.trim() },
      });

      res.status(201).json(entry);
    } catch (err) {
      console.error('Error posting campaign note:', err);
      error(err, req, res);
    }
  });
}
