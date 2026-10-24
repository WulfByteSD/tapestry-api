import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import CombatantOriginsHandler from '../handlers/CombatantOrigins.handler';
import { CRUDService } from '../../../../utils/baseCRUD';
import CombatantHandler from '../handlers/Combatant.handler';

export default class CombatantService extends CRUDService {
  public getOrigins = asyncHandler(async (_req: Request, res: Response): Promise<Response> =>
    res.status(200).json({ success: true, payload: await new CombatantOriginsHandler().list() }));

  constructor() {
    super(CombatantHandler);

    this.queryKeys = ['settingKeys', 'key', 'name'];

    this.requiresAuth = {
      getResources: true,
      getResource: true,
      create: true,
      updateResource: true,
      removeResource: true,
    };
  }
}
