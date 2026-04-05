import { Response } from 'express';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import asyncHandler from '../../../../middleware/asyncHandler';
import CampaignActivity from '../model/CampaignActivityModel';
import CampaignModel from '../model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import mongoose from 'mongoose';

const MAX_NOTE_LENGTH = 500;
const DEFAULT_FEED_LIMIT = 20;
const MAX_FEED_LIMIT = 50;

export default class CampaignActivityService {
  /**
   * GET /:id/activity?limit=20&before=<activityId>
   * Returns a paginated activity feed for a campaign.
   * Any authenticated campaign member (or owner) may read the feed.
   */
  getFeed = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;
    const { before, limit: limitParam, type } = req.query;

    const limit = Math.min(parseInt(limitParam as string) || DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT);

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

    // Build query
    const query: Record<string, any> = { campaign: new mongoose.Types.ObjectId(campaignId as string) };

    if (before) {
      query._id = { $lt: new mongoose.Types.ObjectId(before as string) };
    }

    if (type) {
      query.activityType = type;
    }

    const entries = await CampaignActivity.find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = entries.length > limit;
    const page = entries.slice(0, limit);
    const nextCursor = hasMore ? page[page.length - 1]._id.toString() : null;

    res.status(200).json({ entries: page, nextCursor });
  });

  /**
   * POST /:id/activity
   * Storyweaver/co-SW only. Writes a manual sw.note directly (no event).
   */
  postNote = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: campaignId } = req.params;
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    if (text.length > MAX_NOTE_LENGTH) {
      return res.status(400).json({ error: `Note must be ${MAX_NOTE_LENGTH} characters or fewer` });
    }

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
    const member = campaign.members.find((m: any) => m.player.toString() === playerId);
    const isSW = isOwner || (member && ['sw', 'co-sw'].includes(member.role));

    if (!isSW) {
      return res.status(403).json({ error: 'Only storyweavers may post notes' });
    }

    const entry = await CampaignActivity.create({
      campaign: campaignId,
      activityType: 'sw.note',
      actor: {
        player: playerProfile._id,
        playerNameSnapshot: playerProfile.displayName,
      },
      payload: { text: text.trim() },
    });

    res.status(201).json(entry);
  });
}
