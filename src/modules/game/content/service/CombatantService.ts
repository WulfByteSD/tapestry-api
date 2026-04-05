import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';
import CombatantHandler from '../handlers/Combatant.handler';

export default class CombatantService extends CRUDService {
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
