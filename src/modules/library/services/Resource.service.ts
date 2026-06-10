import { Request, Response } from 'express';
import { CRUDService } from '../../../utils/baseCRUD';
import { ResourceHandler } from '../handlers/Resource.handler';

/**
 * ResourceService
 */
export default class ResourceService extends CRUDService {
  constructor() {
    super(ResourceHandler);

    // Define searchable fields for keyword queries
    this.queryKeys = [];

    // All endpoints require authentication
    this.requiresAuth = {
      create: true,
      getResources: true,
      getResource: true,
    };
  }

  /**
   * @description Public View endpoint for a resource, 
   * @param req 
   * @param res 
   */
  async viewResource(req: Request, res: Response): Promise<void> {}

  /**
   * @description Authenticated endpoint to view a resource, must have entitlement to view the resource
   * @param req 
   * @param res
   */
  async consumeResource(req: Request, res: Response): Promise<void> {}
}
