import { Readable } from 'stream';
import axios from 'axios';
import { ResourceHandler } from '../Resource.handler';
import ResourceService from '../../services/Resource.service';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import Resource from '../../models/Resource';
import RAG from '../../models/RAG';
import { CloudinaryHandler } from '../../../upload/handlers/CloudinaryHandler';

jest.mock('axios');
jest.mock('../../../profiles/player/model/PlayerModel', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
  },
}));
jest.mock('../../models/Resource', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    findById: jest.fn(),
  },
}));
jest.mock('../../models/RAG', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    findOne: jest.fn(),
  },
}));
jest.mock('../../../upload/handlers/CloudinaryHandler', () => ({
  CloudinaryHandler: jest.fn().mockImplementation(() => ({
    getAsset: jest.fn(),
  })),
}));

const mockPlayerFindOne = PlayerModel.findOne as jest.Mock;
const mockResourceFind = Resource.find as jest.Mock;
const mockResourceFindById = Resource.findById as jest.Mock;
const mockRagFind = RAG.find as jest.Mock;
const mockRagFindOne = RAG.findOne as jest.Mock;
const mockAxiosGet = axios.get as jest.Mock;
const MockCloudinaryHandler = CloudinaryHandler as jest.Mock;

const objectId = (value: string) => ({
  toString: () => value,
});

describe('ResourceHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyResources', () => {
    it('returns active owned published resources without exposing asset keys', async () => {
      mockPlayerFindOne.mockResolvedValue({ _id: objectId('player-id') });
      mockRagFind.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: objectId('grant-1'),
            userId: 'player-id',
            resourceId: 'published-resource',
            permissions: ['view'],
            grantedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          {
            _id: objectId('grant-2'),
            userId: 'player-id',
            resourceId: 'unpublished-resource',
            permissions: ['view'],
            grantedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      });
      mockResourceFind.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: objectId('published-resource'),
            key: 'players-guide',
            slug: 'players-guide',
            title: 'Players Guide',
            kind: 'guide',
            format: 'pdf',
            status: 'published',
            accessPolicy: 'entitlement',
            presentation: {},
            currentRelease: {
              version: '1.0',
              provider: 'cloudinary',
              assetKey: 'secret-asset-key',
              mimeType: 'application/pdf',
            },
            tags: [],
            authors: [],
          },
        ]),
      });

      const result = await new ResourceHandler().getMyResources('auth-user-id');

      expect(mockRagFind).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'player-id',
          status: 'active',
          permissions: 'view',
        })
      );
      expect(mockResourceFind).toHaveBeenCalledWith({
        _id: { $in: ['published-resource', 'unpublished-resource'] },
        status: 'published',
      });
      expect(result).toHaveLength(1);
      expect(result[0].consumeUrl).toBe('/api/v1/library/resources/published-resource/consume');
      expect(result[0].resource.currentRelease).not.toHaveProperty('assetKey');
    });
  });

  describe('prepareConsumableResource', () => {
    it('blocks when the authenticated user has no player profile', async () => {
      mockPlayerFindOne.mockResolvedValue(null);
      mockResourceFindById.mockResolvedValue({
        _id: objectId('resource-id'),
        status: 'published',
        accessPolicy: 'entitlement',
      });

      await expect(new ResourceHandler().prepareConsumableResource('resource-id', 'auth-user-id')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Player profile not found',
      });
    });

    it('blocks unpublished resources', async () => {
      mockPlayerFindOne.mockResolvedValue({ _id: objectId('player-id') });
      mockResourceFindById.mockResolvedValue({
        _id: objectId('resource-id'),
        status: 'draft',
        accessPolicy: 'entitlement',
      });

      await expect(new ResourceHandler().prepareConsumableResource('resource-id', 'auth-user-id')).rejects.toMatchObject({
        statusCode: 403,
        message: 'Resource is not available',
      });
    });

    it('blocks when no active view entitlement exists', async () => {
      mockPlayerFindOne.mockResolvedValue({ _id: objectId('player-id') });
      mockResourceFindById.mockResolvedValue({
        _id: objectId('resource-id'),
        status: 'published',
        accessPolicy: 'entitlement',
      });
      mockRagFindOne.mockResolvedValue(null);

      await expect(new ResourceHandler().prepareConsumableResource('resource-id', 'auth-user-id')).rejects.toMatchObject({
        statusCode: 403,
        message: 'You do not have access to this resource',
      });
    });

    it('blocks unsupported providers after entitlement is proven', async () => {
      mockPlayerFindOne.mockResolvedValue({ _id: objectId('player-id') });
      mockResourceFindById.mockResolvedValue({
        _id: objectId('resource-id'),
        slug: 'players-guide',
        title: 'Players Guide',
        format: 'pdf',
        status: 'published',
        accessPolicy: 'entitlement',
        currentRelease: {
          provider: 's3',
          assetKey: 'resource-key',
        },
      });
      mockRagFindOne.mockResolvedValue({ _id: objectId('grant-id') });

      await expect(new ResourceHandler().prepareConsumableResource('resource-id', 'auth-user-id')).rejects.toMatchObject({
        statusCode: 501,
        message: 'Unsupported resource provider: s3',
      });
    });

    it('returns stream metadata for active cloudinary resources', async () => {
      mockPlayerFindOne.mockResolvedValue({ _id: objectId('player-id') });
      mockResourceFindById.mockResolvedValue({
        _id: objectId('resource-id'),
        slug: 'players-guide',
        title: 'Players Guide',
        format: 'pdf',
        status: 'published',
        accessPolicy: 'entitlement',
        currentRelease: {
          provider: 'cloudinary',
          assetKey: 'resource-key',
          mimeType: 'application/pdf',
        },
      });
      mockRagFindOne.mockResolvedValue({ _id: objectId('grant-id') });
      const handler = new ResourceHandler();
      MockCloudinaryHandler.mock.results[0].value.getAsset.mockResolvedValue({
        secure_url: 'https://cdn.example.com/players-guide.pdf',
        bytes: 1234,
        format: 'pdf',
      });

      const result = await handler.prepareConsumableResource('resource-id', 'auth-user-id');

      expect(result).toEqual({
        streamUrl: 'https://cdn.example.com/players-guide.pdf',
        contentType: 'application/pdf',
        contentLength: 1234,
        fileName: 'players-guide.pdf',
      });
    });

    it('returns stream metadata for public resources without requiring entitlement checks', async () => {
      mockResourceFindById.mockResolvedValue({
        _id: objectId('resource-id'),
        slug: 'players-guide',
        title: 'Players Guide',
        format: 'pdf',
        status: 'published',
        accessPolicy: 'public',
        currentRelease: {
          provider: 'external',
          assetKey: 'https://cdn.example.com/players-guide.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1234,
        },
      });

      const result = await new ResourceHandler().prepareConsumableResource('resource-id');

      expect(mockPlayerFindOne).not.toHaveBeenCalled();
      expect(mockRagFindOne).not.toHaveBeenCalled();
      expect(result).toEqual({
        streamUrl: 'https://cdn.example.com/players-guide.pdf',
        contentType: 'application/pdf',
        contentLength: 1234,
        fileName: 'players-guide',
      });
    });

    it('blocks entitlement resources when unauthenticated', async () => {
      mockResourceFindById.mockResolvedValue({
        _id: objectId('resource-id'),
        status: 'published',
        accessPolicy: 'entitlement',
      });

      await expect(new ResourceHandler().prepareConsumableResource('resource-id')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Authentication is required to access this resource',
      });
    });
  });
});

describe('ResourceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('streams consumable resources inline without exposing the upstream URL in JSON', async () => {
    jest.spyOn(ResourceHandler.prototype, 'prepareConsumableResource').mockResolvedValue({
      streamUrl: 'https://cdn.example.com/players-guide.pdf',
      contentType: 'application/pdf',
      contentLength: 1234,
      fileName: 'players-guide.pdf',
    });

    const stream = new Readable({ read() {} });
    const pipe = jest.fn();
    stream.pipe = pipe as any;
    mockAxiosGet.mockResolvedValue({
      headers: {},
      data: stream,
    });

    const service = new ResourceService();
    const req = {
      params: { id: 'resource-id' },
      user: { _id: objectId('auth-user-id') },
    } as any;
    const res = {
      setHeader: jest.fn(),
    } as any;

    await service.consumeResource(req, res);

    expect(mockAxiosGet).toHaveBeenCalledWith('https://cdn.example.com/players-guide.pdf', {
      responseType: 'stream',
    });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="players-guide.pdf"');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '1234');
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('streams public resources without requiring auth context', async () => {
    jest.spyOn(ResourceHandler.prototype, 'prepareConsumableResource').mockResolvedValue({
      streamUrl: 'https://cdn.example.com/public-guide.pdf',
      contentType: 'application/pdf',
      contentLength: 4321,
      fileName: 'public-guide.pdf',
    });

    const stream = new Readable({ read() {} });
    const pipe = jest.fn();
    stream.pipe = pipe as any;
    mockAxiosGet.mockResolvedValue({
      headers: {},
      data: stream,
    });

    const service = new ResourceService();
    const req = {
      params: { id: 'resource-id' },
    } as any;
    const res = {
      setHeader: jest.fn(),
    } as any;

    await service.streamPublicResource(req, res);

    expect(ResourceHandler.prototype.prepareConsumableResource).toHaveBeenCalledWith('resource-id', undefined);
    expect(mockAxiosGet).toHaveBeenCalledWith('https://cdn.example.com/public-guide.pdf', {
      responseType: 'stream',
    });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="public-guide.pdf"');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '4321');
    expect(pipe).toHaveBeenCalledWith(res);
  });
});
