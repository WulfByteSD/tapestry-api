import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import { requestActor } from '../helpers/adventureHttp.helpers';
import express from 'express';
import { pipeline } from 'stream/promises';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import AdventureAttachmentHandler from '../handlers/AdventureAttachment.handler';
import AdventureReferenceHandler from '../handlers/AdventureReference.handler';
import AdventureSharingHandler from '../handlers/AdventureSharing.handler';
import AdventureStorageHandler from '../handlers/AdventureStorage.handler';
import { adventureView, parse } from '../helpers/adventure.helpers';
import { revisionInput, StoredMaterial } from '../types/adventure.contracts';

/** HTTP upload orchestration and streaming; every read resolves authorization before storage access. */
export default class AdventureAttachmentService {
  private readonly attachments = new AdventureAttachmentHandler();
  private readonly reference = new AdventureReferenceHandler();
  private readonly sharing = new AdventureSharingHandler();
  private readonly storage = new AdventureStorageHandler();
  parseBytes = express.raw({ type: ['application/octet-stream', 'image/png', 'image/jpeg', 'image/webp', 'application/pdf'], limit: '10mb' });
  upload = asyncHandler(async (req: Request, res: Response) => {
    const actor = requestActor(req);
    const revision = parse(revisionInput, { revision: Number(req.query.revision) }).revision;
    const target = await this.attachments.prepare(actor, req.params.id, req.params.resourceId, revision);
    if (!Buffer.isBuffer(req.body)) throw new ErrorUtil('Send attachment bytes as application/octet-stream', 400);
    const uploaded = await this.storage.upload(target.adventureId, target.resourceId, req.body);
    try {
      const result = await this.attachments.saveAsset(actor, target.adventureId, target.resourceId, revision, uploaded);
      return res.json({ success: true, payload: adventureView(result.toObject()) });
    } catch (error) {
      // Delete only this failed upload on a known conflict, never prior assets on an uncertain database outcome.
      if (error instanceof ErrorUtil && error.statusCode === 409) await this.storage.discard(uploaded).catch(() => undefined);
      throw error;
    }
  });
  remove = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.attachments.removeAsset(requestActor(req), req.params.id, req.params.resourceId, parse(revisionInput, req.body).revision);
    return res.json({ success: true, payload: adventureView(result.toObject()) });
  });
  adminRead = asyncHandler(async (req: Request, res: Response) => {
    const material = await this.attachments.preview(requestActor(req), req.params.id, req.params.resourceId);
    await this.stream(res, material);
  });
  ownerRead = asyncHandler(async (req: Request, res: Response) => {
    const material = await this.reference.material(requestActor(req), req.params.id, req.params.resourceId);
    await this.stream(res, material);
  });
  campaignRead = asyncHandler(async (req: Request, res: Response) => {
    const material = await this.sharing.sharedRead(requestActor(req), req.params.campaignId, req.params.id, req.params.resourceId);
    await this.stream(res, material);
  });
  private async stream(res: Response, material: StoredMaterial) {
    if (!material.asset) throw new ErrorUtil('Attachment not found', 404);
    const upstream = await this.storage.open(material.asset);
    res.setHeader('Content-Type', material.asset.contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="' + material.id + '.' + material.asset.format + '"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    try { await pipeline(upstream, res); } catch { if (!res.destroyed) res.destroy(); }
  }
}
