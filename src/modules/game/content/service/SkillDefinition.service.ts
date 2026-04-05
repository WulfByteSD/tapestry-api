import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { CRUDService } from '../../../../utils/baseCRUD';
import SkillDefinitionHandler from '../handlers/SkillDefinition.handler';
import { skillCsvImportDefinition } from '../util/import/contentCsvDefinition';
import { getUploadedCsvFile, resolveImportMode, runCsvImport } from '../util/import/csvImport';

export default class SkillsService extends CRUDService {
  private skillHandler: SkillDefinitionHandler;

  constructor() {
    super(SkillDefinitionHandler);
    this.skillHandler = this.handler as SkillDefinitionHandler;

    this.queryKeys = ['key', 'name', 'notes', 'tags', 'category', 'settingKeys'];

    this.requiresAuth = {
      getResources: true,
      getResource: true,
      create: true,
      updateResource: true,
      removeResource: true,
    };
  }

  getSkillByKey = asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await this.skillHandler.fetchByKey(req.params.key);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Skill not found',
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

  getSkillsForSetting = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { settingKey } = req.params;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;

      const result = await this.skillHandler.fetchBySettingKey(settingKey, category);

      return res.status(200).json({
        success: true,
        payload: result,
      });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });
  importCsv = asyncHandler(async (req: Request, res: Response) => {
      try {
        const file = getUploadedCsvFile(req);
        const mode = resolveImportMode(req.query.mode);
        const result = await runCsvImport(skillCsvImportDefinition, file, mode);
  
        if (!result.success) {
          return res.status(400).json({
            success: false,
            payload: result,
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
}
