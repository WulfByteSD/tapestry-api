import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import { requestActor } from '../helpers/adventureHttp.helpers';
import AdventureAuthoringHandler from '../handlers/AdventureAuthoring.handler';
import { adventureView, parse, requireAdmin } from '../helpers/adventure.helpers';
import { revisionInput } from '../types/adventure.contracts';

export default class AdventureAdminService {
  private readonly handler = new AdventureAuthoringHandler();
  authorize = asyncHandler(async (req: Request, _res: Response, next: () => void) => {
    requireAdmin(requestActor(req));
    next();
  });
  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.list(requestActor(req), Number(req.query.page || 0));
    return res.json({ success: true, payload: result });
  });
  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.create(requestActor(req), req.body);
    return res.status(201).json({ success: true, payload: adventureView(result.toObject()) });
  });
  read = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.preview(requestActor(req), req.params.id);
    return res.json({ success: true, payload: adventureView(result) });
  });
  update = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.update(requestActor(req), req.params.id, req.body);
    return res.json({ success: true, payload: adventureView(result.toObject()) });
  });
  changeStatus = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.changeStatus(requestActor(req), req.params.id, req.body);
    return res.json({ success: true, payload: adventureView(result.toObject()) });
  });
  remove = asyncHandler(async (req: Request, res: Response) => {
    await this.handler.remove(requestActor(req), req.params.id, parse(revisionInput, req.body).revision);
    return res.status(204).end();
  });
}
