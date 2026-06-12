import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { CRUDHandler } from '../../../utils/baseCRUD';
import { CloudinaryHandler } from '../../upload/handlers/CloudinaryHandler';
import PlayerModel from '../../profiles/player/model/PlayerModel';
import type { IResource } from '../models/Resource';
import Resource from '../models/Resource';
import RAG from '../models/RAG';
import slugify from 'slugify';

export interface ConsumableResourcePayload {
  streamUrl: string;
  contentType?: string;
  contentLength?: number;
  fileName: string;
}

export interface MyResourcePayload {
  grant: {
    id: string;
    permissions: Array<'view' | 'download'>;
    grantedAt: Date;
    expiresAt?: Date;
  };
  resource: {
    id: string;
    key: string;
    slug: string;
    title: string;
    subtitle?: string;
    summary?: string;
    description?: string;
    kind: IResource['kind'];
    format: IResource['format'];
    status: IResource['status'];
    accessPolicy: IResource['accessPolicy'];
    presentation: IResource['presentation'];
    currentRelease: {
      version: string;
      provider: IResource['currentRelease']['provider'];
      mimeType?: string;
      sizeBytes?: number;
      publishedAt?: Date;
    };
    tags: string[];
    authors?: string[];
    publishedAt?: Date;
  };
  consumeUrl: string;
}

export class ResourceHandler extends CRUDHandler<IResource> {
  private readonly cloudinaryHandler = new CloudinaryHandler();

  constructor() {
    super(Resource);
  }

  protected async beforeCreate(data: any): Promise<void> {
    this.normalizeResourceData(data, true);
  }

  protected async beforeUpdate(id: string, data: any): Promise<void> {
    const existing = await this.Schema.findById(id).lean();
    if (!existing) {
      throw new ErrorUtil('Resource not found', 404);
    }

    this.normalizeResourceData(data, false);
  }

  async getMyResources(authenticatedUserId: string): Promise<MyResourcePayload[]> {
    const playerProfile = await PlayerModel.findOne({ user: authenticatedUserId as any });
    if (!playerProfile) {
      throw new ErrorUtil('Player profile not found', 404);
    }

    const activeGrants = await RAG.find({
      userId: playerProfile._id.toString(),
      status: 'active',
      permissions: 'view',
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).lean();

    const resourceIds = [...new Set(activeGrants.map((grant) => grant.resourceId))];
    if (resourceIds.length === 0) {
      return [];
    }

    const resources = await this.Schema.find({
      _id: { $in: resourceIds },
      status: 'published',
    }).lean();

    const resourcesById = new Map(resources.map((resource) => [resource._id.toString(), resource]));

    return activeGrants
      .map((grant) => {
        const resource = resourcesById.get(grant.resourceId);
        if (!resource) {
          return null;
        }

        return {
          grant: {
            id: grant._id.toString(),
            permissions: grant.permissions,
            grantedAt: grant.grantedAt,
            ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
          },
          resource: this.toOwnedResource(resource),
          consumeUrl: `/api/v1/library/resources/${resource._id.toString()}/consume`,
        };
      })
      .filter((entry): entry is MyResourcePayload => Boolean(entry));
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

  private normalizeResourceData(data: any, isCreate: boolean): void {
    if ('key' in data || isCreate) {
      data.key = this.normalizeRequiredSlug(data.key, 'Resource key is required');
    }

    if ('slug' in data || 'title' in data || isCreate) {
      data.slug = this.normalizeRequiredSlug(data.slug || data.title, 'Resource slug is required');
    }

    if ('tags' in data) {
      data.tags = this.normalizeStringArray(data.tags);
    }

    if ('authors' in data) {
      data.authors = this.normalizeStringArray(data.authors);
    }

    if ('currentRelease' in data || isCreate) {
      this.validateCurrentRelease(data.currentRelease);
    }
  }

  private normalizeRequiredSlug(value: unknown, message: string): string {
    const normalized = slugify(String(value || '').trim(), { lower: true, strict: true }).trim();
    if (!normalized) {
      throw new ErrorUtil(message, 400);
    }

    return normalized;
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))];
  }

  private validateCurrentRelease(currentRelease: any): void {
    if (!currentRelease || typeof currentRelease !== 'object') {
      throw new ErrorUtil('Resource currentRelease is required', 400);
    }

    if (!String(currentRelease.version || '').trim()) {
      throw new ErrorUtil('Resource currentRelease version is required', 400);
    }

    if (!['cloudinary', 's3', 'external'].includes(currentRelease.provider)) {
      throw new ErrorUtil('Resource currentRelease provider is invalid', 400);
    }

    if (!String(currentRelease.assetKey || '').trim()) {
      throw new ErrorUtil('Resource currentRelease assetKey is required', 400);
    }
  }

  private toOwnedResource(resource: any): MyResourcePayload['resource'] {
    return {
      id: resource._id.toString(),
      key: resource.key,
      slug: resource.slug,
      title: resource.title,
      subtitle: resource.subtitle,
      summary: resource.summary,
      description: resource.description,
      kind: resource.kind,
      format: resource.format,
      status: resource.status,
      accessPolicy: resource.accessPolicy,
      presentation: resource.presentation || {},
      currentRelease: {
        version: resource.currentRelease.version,
        provider: resource.currentRelease.provider,
        mimeType: resource.currentRelease.mimeType,
        sizeBytes: resource.currentRelease.sizeBytes,
        publishedAt: resource.currentRelease.publishedAt,
      },
      tags: resource.tags || [],
      authors: resource.authors || [],
      publishedAt: resource.publishedAt,
    };
  }
}
