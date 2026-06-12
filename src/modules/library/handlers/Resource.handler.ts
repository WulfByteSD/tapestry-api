import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { CRUDHandler } from '../../../utils/baseCRUD';
import { CloudinaryHandler } from '../../upload/handlers/CloudinaryHandler';
import PlayerModel from '../../profiles/player/model/PlayerModel';
import type { IResource } from '../models/Resource';
import Resource from '../models/Resource';
import RAG from '../models/RAG';

export interface ConsumableResourcePayload {
  streamUrl: string;
  contentType?: string;
  contentLength?: number;
  fileName: string;
}

export class ResourceHandler extends CRUDHandler<IResource> {
  private readonly cloudinaryHandler = new CloudinaryHandler();

  constructor() {
    super(Resource);
  }

  async prepareConsumableResource(resourceId: string, authenticatedUserId: string): Promise<ConsumableResourcePayload> {
    const playerProfile = await PlayerModel.findOne({ user: authenticatedUserId as any });
    if (!playerProfile) {
      throw new ErrorUtil('Player profile not found', 404);
    }

    const resource = await this.Schema.findById(resourceId);
    if (!resource) {
      throw new ErrorUtil('Resource not found', 404);
    }

    if (resource.status !== 'published') {
      throw new ErrorUtil('Resource is not available', 403);
    }

    if (resource.accessPolicy !== 'entitlement') {
      throw new ErrorUtil('This resource is not configured for entitlement consumption', 400);
    }

    const entitlement = await RAG.findOne({
      userId: playerProfile._id.toString(),
      resourceId: resource._id.toString(),
      status: 'active',
      permissions: 'view',
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    });

    if (!entitlement) {
      throw new ErrorUtil('You do not have access to this resource', 403);
    }

    if (resource.currentRelease.provider === 'cloudinary') {
      const asset = await this.cloudinaryHandler.getAsset(resource.currentRelease.assetKey);

      return {
        streamUrl: asset.secure_url,
        contentType: resource.currentRelease.mimeType || this.resolveContentType(resource.format, asset.format),
        contentLength: resource.currentRelease.sizeBytes || asset.bytes,
        fileName: this.buildFileName(resource.slug, resource.title, asset.format || resource.format),
      };
    }

    if (resource.currentRelease.provider === 'external') {
      return {
        streamUrl: resource.currentRelease.assetKey,
        contentType: resource.currentRelease.mimeType || this.resolveContentType(resource.format),
        contentLength: resource.currentRelease.sizeBytes,
        fileName: this.buildFileName(resource.slug, resource.title),
      };
    }

    throw new ErrorUtil(`Unsupported resource provider: ${resource.currentRelease.provider}`, 501);
  }

  private resolveContentType(resourceFormat: string, assetFormat?: string): string | undefined {
    const format = (assetFormat || resourceFormat || '').toLowerCase();

    switch (format) {
      case 'pdf':
        return 'application/pdf';
      case 'audio':
        return 'audio/mpeg';
      case 'video':
        return 'video/mp4';
      case 'archive':
        return 'application/zip';
      default:
        return undefined;
    }
  }

  private buildFileName(slug: string, title: string, extension?: string): string {
    const baseName = (slug || title || 'resource').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const normalizedExtension = (extension || '').replace(/^\./, '');

    return normalizedExtension ? `${baseName}.${normalizedExtension}` : baseName;
  }
}
