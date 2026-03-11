import { Response } from 'express';
import PushSubscriptionModel from '../model/PushSubscriptionModel';
import webpush from 'web-push';
import asyncHandler from '../../../middleware/asyncHandler';
import error from '../../../middleware/error';
import { AuthenticatedRequest } from '../../../types/AuthenticatedRequest';

webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT!, process.env.WEB_PUSH_PUBLIC_KEY!, process.env.WEB_PUSH_PRIVATE_KEY!);

export class PushSubscriptionService {
  public listMine = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?._id;

      const subscriptions = await PushSubscriptionModel.find({
        user: userId as any,
        isActive: true,
      }).sort({ updatedAt: -1 });

      return res.status(200).json({ 
        success: true,
        payload: subscriptions,
      });
    } catch (err) {
      return error(err, req, res);
    }
  });

  public upsertMine = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?._id;
      const { subscription, deviceName, userAgent } = req.body;

      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({
          success: false,
          message: 'A valid PushSubscription payload is required.',
        });
      }

      const doc = await PushSubscriptionModel.findOneAndUpdate(
        { endpoint: subscription.endpoint },
        {
          user: userId,
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
          userAgent,
          deviceName,
          isActive: true,
          lastSeenAt: new Date(),
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      return res.status(200).json({
        success: true,
        payload: doc,
      });
    } catch (err) {
      return error(err, req, res);
    }
  });

  public removeMine = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?._id;
      const { endpoint } = req.body;

      if (!endpoint) {
        return res.status(400).json({
          success: false,
          message: 'Subscription endpoint is required.',
        });
      }

      await PushSubscriptionModel.findOneAndDelete({
        user: userId as any,
        endpoint,
      });

      return res.status(200).json({
        success: true,
        message: 'Push subscription removed.',
      });
    } catch (err) {
      return error(err, req, res);
    }
  });

  public sendTestToMe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?._id;

      const subscriptions = await PushSubscriptionModel.find({
        user: userId as any,
        isActive: true,
      });

      const payload = JSON.stringify({
        title: 'Tapestry', 
        body: 'Your push notifications are working.',
        url: '/settings',
      });

      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                expirationTime: sub.expirationTime ?? null,
                keys: {
                  p256dh: sub.keys.p256dh,
                  auth: sub.keys.auth,
                },
              },
              payload
            );
            return { endpoint: sub.endpoint, success: true };
          } catch (err: any) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await PushSubscriptionModel.deleteOne({ _id: sub._id });
            }
            throw err;
          }
        })
      );

      return res.status(200).json({
        success: true,
        payload: results,
      });
    } catch (err) {
      return error(err, req, res);
    }
  });
}
