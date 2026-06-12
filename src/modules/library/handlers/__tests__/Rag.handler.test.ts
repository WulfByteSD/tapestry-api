import { RAGHandler } from '../Rag.handler';
import RAG from '../../models/RAG';

jest.mock('../../models/RAG', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

const mockRagFindById = RAG.findById as jest.Mock;

describe('RAGHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('revokes access grants instead of deleting them', async () => {
    const grant = {
      status: 'active',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockRagFindById.mockResolvedValue(grant);

    const result = await new RAGHandler().delete('grant-id');

    expect(grant.status).toBe('revoked');
    expect(grant.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it('returns a not-found error when revoking a missing grant', async () => {
    mockRagFindById.mockResolvedValue(null);

    await expect(new RAGHandler().delete('missing-grant-id')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Resource access grant not found',
    });
  });
});
