import router from '../resource.routes';

jest.mock('../../../../middleware/AuthMiddleware', () => ({
  AuthMiddleware: {
    protect: (req: any, res: any, next: any) => req.user ? next() : res.status(401).json({ error: 'unauthenticated' }),
    authorizeRoles: (roles: string[]) => (req: any, res: any, next: any) =>
      roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'forbidden' }),
  },
}));
jest.mock('../../services/Resource.service', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => Object.fromEntries(
    ['getResources', 'getResource', 'getPublicResources', 'getPublicResource', 'getMyResources',
      'streamPublicResource', 'consumeResource', 'create', 'updateResource', 'removeResource']
      .map(name => [name, (_req: any, res: any) => res.json({ handler: name })])
  )),
}));

function request(url: string, role?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    let status = 200;
    const res: any = {
      status(code: number) { status = code; return this; },
      json(body: any) { resolve({ status, body }); return this; },
    };
    (router as any).handle({ method: 'GET', url, headers: {}, ...(role ? { user: { role } } : {}) }, res,
      (error: any) => error ? reject(error) : reject(new Error('No route matched')));
  });
}

describe('Resource read route separation (mocked services/auth)', () => {
  it('routes admin list and detail before public matches', async () => {
    expect(await request('/admin', 'admin')).toEqual({ status: 200, body: { handler: 'getResources' } });
    expect(await request('/admin/known-id', 'admin')).toEqual({ status: 200, body: { handler: 'getResource' } });
  });
  it('requires authentication and admin authorization on both admin reads', async () => {
    for (const url of ['/admin', '/admin/known-id']) {
      expect((await request(url)).status).toBe(401);
      expect((await request(url, 'player')).status).toBe(403);
    }
  });
  it('preserves anonymous public list and detail routes', async () => {
    expect((await request('/')).body.handler).toBe('getPublicResources');
    expect((await request('/known-id')).body.handler).toBe('getPublicResource');
  });
});

