import { Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from '../../../../middleware/asyncHandler';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import error from '../../../../middleware/error';
import { AuthenticatedRequest } from '../../../../types/AuthenticatedRequest';
import ExplorerHandler from '../handlers/Explorer.handler';
import { contentReader } from '../util/contentReader';

export const explorerType = z.enum(['lore', 'item', 'combatant']);
const querySchema = z.object({
  q: z.string().trim().max(200).optional(), type: explorerType.optional(),
  setting: z.string().trim().max(120).optional(), kind: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(60).default(24),
});
export default class ExplorerService {
  private handler = new ExplorerHandler();
  private endpoint(action: (req: Request, privileged: boolean) => Promise<any>, list = false) {
    return asyncHandler(async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'private, no-store');
      try {
        const reader = await contentReader(req as AuthenticatedRequest);
        const result = await action(req, reader.privileged);
        return res.json({ success: true, ...(list ? result : { payload: result }) });
      } catch (err) { return error(err, req, res); }
    });
  }
  list = this.endpoint(async req => {
    const query = querySchema.safeParse(req.query);
    if (!query.success) throw new ErrorUtil('Invalid Explorer filters or pagination.', 400);
    return this.handler.list(query.data);
  }, true);
  filters = this.endpoint(async () => this.handler.filters());
  detail = this.endpoint(async (req, privileged) => {
    const type = explorerType.safeParse(req.params.type);
    if (!type.success) throw new ErrorUtil('Unknown content type.', 400);
    return this.handler.detail(type.data, req.params.id, privileged);
  });
}
