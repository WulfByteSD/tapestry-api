import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';
import AbilityDefinitionHandler from '../handlers/AbilityDefinition.handler';

export default class AbilitiesService extends CRUDService {
  private abilityHandler: AbilityDefinitionHandler;

  constructor() {
    super(AbilityDefinitionHandler);
    this.abilityHandler = this.handler as AbilityDefinitionHandler;

    this.queryKeys = ['key', 'name', 'summary', 'effectText', 'tags', 'category', 'settingKeys', 'sourceType', 'activation', 'usageModel'];

    this.requiresAuth = {
      getResources: true,
      getResource: true,
      create: true,
      updateResource: true,
      removeResource: true,
    };
  }

  getAbilityByKey = asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await this.abilityHandler.fetchByKey(req.params.key);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Ability not found',
        });
      }

      return res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });

  getAbilitiesForSetting = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { settingKey } = req.params;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;

      const result = await this.abilityHandler.fetchBySettingKey(settingKey, category);

      return res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });
}
