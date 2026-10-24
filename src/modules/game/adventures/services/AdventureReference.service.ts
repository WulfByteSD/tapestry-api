import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import { requestActor } from '../helpers/adventureHttp.helpers';
import AdventureReferenceHandler from '../handlers/AdventureReference.handler';
import { adventureView, materialView } from '../helpers/adventure.helpers';

export default class AdventureReferenceService {
  private readonly handler = new AdventureReferenceHandler();
  privateResponses = (_req: Request, res: Response, next: () => void) => {
    res.setHeader('Cache-Control', 'private, no-store'); next();
  };
  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.list(requestActor(req), Number(req.query.page || 0));
    return res.json({ success: true, payload: result });
  });
  read = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.ownerRead(requestActor(req), req.params.id);
    return res.json({ success: true, payload: adventureView(result) });
  });
  section = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.section(requestActor(req), req.params.id, req.params.sectionId);
    return res.json({ success: true, payload: result });
  });
  resources = asyncHandler(async (req: Request, res: Response) => {
    const adventure = await this.handler.ownerRead(requestActor(req), req.params.id);
    return res.json({ success: true, payload: this.handler.resources(adventure, req.query) });
  });
  material = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.handler.material(requestActor(req), req.params.id, req.params.resourceId);
    return res.json({ success: true, payload: materialView(result) });
  });
}
