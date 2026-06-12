import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { CRUDHandler, PaginationOptions } from '../../../utils/baseCRUD';
import PlayerModel from '../../profiles/player/model/PlayerModel';
import Resource from '../models/Resource';
import RAG, { IResourceAccessGrant } from '../models/RAG';

export class RAGHandler extends CRUDHandler<IResourceAccessGrant> {
  constructor() {
    super(RAG);
  }

  async grantAccessForUser(input: {
    authUserId: string;
    resourceId: string;
    permissions: Array<'view' | 'download'>;
    source: IResourceAccessGrant['source'];
  }): Promise<{ status: 'granted' | 'already_owned'; grant: IResourceAccessGrant }> {
    const playerProfile = await PlayerModel.findOne({ user: input.authUserId as any });
    if (!playerProfile) {
      throw new ErrorUtil('Player profile not found', 404);
    }

    const resource = await Resource.findById(input.resourceId).select('_id');
    if (!resource) {
      throw new ErrorUtil('Resource not found', 404);
    }

    const normalizedPermissions = [...new Set(input.permissions)].filter((permission) => ['view', 'download'].includes(permission));
    if (normalizedPermissions.length === 0) {
      throw new ErrorUtil('Resource grant failed', 400);
    }

    const activeGrant = await this.Schema.findOne({
      userId: playerProfile._id.toString(),
      resourceId: input.resourceId,
      status: 'active',
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });

    if (activeGrant) {
      const mergedPermissions = [...new Set([...(activeGrant.permissions || []), ...normalizedPermissions])];
      const alreadyOwned = mergedPermissions.length === (activeGrant.permissions || []).length;

      if (alreadyOwned) {
        return {
          status: 'already_owned',
          grant: activeGrant,
        };
      }

      activeGrant.permissions = mergedPermissions;
      activeGrant.source = input.source;
      await activeGrant.save();

      return {
        status: 'granted',
        grant: activeGrant,
      };
    }

    const grant = await this.Schema.create({
      userId: playerProfile._id.toString(),
      resourceId: input.resourceId,
      permissions: normalizedPermissions,
      source: input.source,
      status: 'active',
      grantedAt: new Date(),
    });

    return {
      status: 'granted',
      grant,
    };
  }
}
