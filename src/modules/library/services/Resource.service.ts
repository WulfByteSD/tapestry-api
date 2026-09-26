import { Request, Response } from 'express';
import axios from 'axios';
import error from '../../../middleware/error';
import { CRUDService } from '../../../utils/baseCRUD';
import { AdvFilters } from '../../../utils/advFilter/AdvFilters';
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
      getMyResources: true,
      consumeResource: true,
      streamPublicResource: false,
      getPublicResources: false,
      getPublicResource: false,
    };

    this.getMyResources = this.getMyResources.bind(this);
    this.consumeResource = this.consumeResource.bind(this);
    this.streamPublicResource = this.streamPublicResource.bind(this);
    this.getPublicResources = this.getPublicResources.bind(this);
    this.getPublicResource = this.getPublicResource.bind(this);
  }

  async getMyResources(req: Request, res: Response): Promise<void> {
    try {
      this.ensureAuthenticated(req as AuthenticatedRequest, 'getMyResources' as keyof CRUDService);

      const authenticatedRequest = req as AuthenticatedRequest;
      const resources = await this.handler.getMyResources(authenticatedRequest.user._id.toString());

      res.status(200).json({
        success: true,
        payload: resources,
      });
    } catch (err) {
      console.error(err);
      error(err, req, res);
    }
  }

  /**
   * @description Authenticated endpoint to view a resource, must have entitlement (RAG) to view the resource
   * @param req
   * @param res
   */
  async consumeResource(req: Request, res: Response): Promise<void> {
    try {
      this.ensureAuthenticated(req as AuthenticatedRequest, 'consumeResource' as keyof CRUDService);

      const authenticatedRequest = req as AuthenticatedRequest;
      await this.streamResourceById(req, res, authenticatedRequest.user._id.toString());
    } catch (err) {
      console.error(err);
      error(err, req, res);
    }
  }

  async streamPublicResource(req: Request, res: Response): Promise<void> {
    try {
      await this.streamResourceById(req, res);
    } catch (err) {
      console.error(err);
      error(err, req, res);
    }
  }

  async getPublicResources(req: Request, res: Response): Promise<void> {
    try {
      const pageSize = Number(req.query?.pageLimit) || 10;
      const page = Number(req.query?.pageNumber) || 1;

      const keywordQuery = AdvFilters.query(this.queryKeys, req.query?.keyword as string);
      const filterIncludeOptions = AdvFilters.filter(req.query?.includeOptions as string);
      const orConditions = [
        ...(Object.keys(keywordQuery[0]).length > 0 ? keywordQuery : []),
        ...(Array.isArray(filterIncludeOptions) && filterIncludeOptions.length > 0 && Object.keys(filterIncludeOptions[0]).length > 0 ? filterIncludeOptions : []),
      ];

      const paginationOptions = {
        filters: AdvFilters.filter(req.query?.filterOptions as string),
        sort: AdvFilters.sort((req.query?.sortOptions as string) || '-createdAt'),
        query: orConditions,
        page,
        limit: pageSize,
      };

      const [result] = await this.handler.fetchAllPublic(paginationOptions);

      res.status(200).json({
        success: true,
        payload: [...result.entries],
        metadata: {
          page,
          pages: Math.ceil(result.metadata[0]?.totalCount / pageSize) || 0,
          totalCount: result.metadata[0]?.totalCount || 0,
          prevPage: page - 1,
          nextPage: page + 1,
        },
      });
    } catch (err) {
      console.error(err);
      error(err, req, res);
    }
  }

  async getPublicResource(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.handler.fetchPublic(req.params.id);
      if (!result) {
        res.status(404).json({ success: false, message: 'Resource not found' });
        return;
      }
      res.status(200).json({ success: true, payload: result });
    } catch (err) {
      console.error(err);
      error(err, req, res);
    }
  }

  private async streamResourceById(req: Request, res: Response, authenticatedUserId?: string): Promise<void> {
    const consumableResource = await this.handler.prepareConsumableResource(req.params.id, authenticatedUserId);
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
  }
}
