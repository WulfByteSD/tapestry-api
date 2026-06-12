import { Request, Response } from 'express';
import axios from 'axios';
import error from '../../../middleware/error';
import { CRUDService } from '../../../utils/baseCRUD';
import { AuthenticatedRequest } from '../../../types/AuthenticatedRequest';
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
      consumeResource: true,
    };

    this.viewResource = this.viewResource.bind(this);
    this.consumeResource = this.consumeResource.bind(this);
  }

  /**
   * @description Public View endpoint for a resource, 
   * @param req 
   * @param res 
   */
  async viewResource(req: Request, res: Response): Promise<void> {}

  /**
   * @description Authenticated endpoint to view a resource, must have entitlement (RAG) to view the resource
   * @param req 
   * @param res
   */
  async consumeResource(req: Request, res: Response): Promise<void> {
    try {
      this.ensureAuthenticated(req as AuthenticatedRequest, 'consumeResource' as keyof CRUDService);

      const authenticatedRequest = req as AuthenticatedRequest;
      const consumableResource = await this.handler.prepareConsumableResource(req.params.id, authenticatedRequest.user._id.toString());
      const upstreamResponse = await axios.get(consumableResource.streamUrl, {
        responseType: 'stream',
      });

      res.setHeader('Content-Type', consumableResource.contentType || upstreamResponse.headers['content-type'] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${consumableResource.fileName}"`);

      const contentLength = consumableResource.contentLength || upstreamResponse.headers['content-length'];
      if (contentLength) {
        res.setHeader('Content-Length', contentLength.toString());
      }

      upstreamResponse.data.pipe(res);
    } catch (err) {
      console.error(err);
      error(err, req, res);
    }
  }
}
