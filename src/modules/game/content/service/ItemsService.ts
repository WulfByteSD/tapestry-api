import { Request, Response } from 'express';
import asyncHandler from '../../../../middleware/asyncHandler';
import error from '../../../../middleware/error';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { CRUDService } from '../../../../utils/baseCRUD';
import { AdvFilters } from '../../../../utils/advFilter/AdvFilters';
import ItemDefinitionHandler from '../handlers/ItemDefinition.handler';
import { getUploadedCsvFile, resolveImportMode, runCsvImport } from '../util/import/csvImport';
import { itemCsvImportDefinition } from '../util/import/contentCsvDefinition';
import { runCsvExport, sendCsvResponse } from '../util/export/csvExport';
import { itemCsvExportDefinition } from '../util/export/contentCsvExport';

export default class ItemsService extends CRUDService {
  private itemHandler: ItemDefinitionHandler;

  constructor() {
    super(ItemDefinitionHandler);
    this.itemHandler = this.handler as ItemDefinitionHandler;
    this.queryKeys = ['key', 'name', 'notes', 'tags', 'category', 'settingKeys'];
    this.requiresAuth = {
      getResources: true,
      getResource: true,
      // create/update/delete deliberately not exposed yet
    };
  }

  getItemByKey = asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await this.itemHandler.fetchByKey(req.params.key);
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Item not found',
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

  getItemsForSetting = asyncHandler(async (req: Request, res: Response) => {
    try {
      const { settingKey } = req.params;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;

      const result = await this.itemHandler.fetchBySettingKey(settingKey, category);

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
      const result = await runCsvImport(itemCsvImportDefinition, file, mode);

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

  exportCsvCount = asyncHandler(async (req: Request, res: Response) => {
    try {
      const mongoFilter = this.parseExportFilter(req);
      const count = await this.itemHandler.fetchForExportCount(mongoFilter);
      return res.status(200).json({ success: true, payload: { count } });
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });

  exportCsv = asyncHandler(async (req: Request, res: Response) => {
    try {
      const mongoFilter = this.parseExportFilter(req);
      const results = await this.itemHandler.fetchForExport(mongoFilter);
      const csv = runCsvExport(itemCsvExportDefinition, results);
      const filename = `items-export-${Date.now()}.csv`;
      return sendCsvResponse(res, filename, csv);
    } catch (err) {
      console.error(err);
      return error(err, req, res);
    }
  });

  private parseExportFilter(req: Request): Record<string, any>[] {
    const mongoFilter = AdvFilters.filter(req.query.filterOptions as string);
    if (Object.keys(mongoFilter[0]).length === 0) {
      throw new ErrorUtil('At least one filter is required for export', 400);
    }
    return mongoFilter;
  }
}
