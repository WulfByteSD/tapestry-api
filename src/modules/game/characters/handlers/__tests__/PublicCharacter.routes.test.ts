import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import CharacterModel from '../../model/CharacterModel';
import { buildEffectiveAbilities } from '../../helpers/buildEffectiveAbilities';
import characterRoutes from '../../routes';

jest.mock('../../model/CharacterModel', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../helpers/buildEffectiveAbilities', () => ({ buildEffectiveAbilities: jest.fn() }));
// Keep the real router and auth guard; isolate unrelated CRUD services and models.
jest.mock('../../service/CharacterService', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => new Proxy({}, { get: () => (_req: unknown, res: express.Response) => res.sendStatus(204) })),
}));
jest.mock('../../../../../utils/ModelMap', () => ({ ModelMap: {} }));
jest.mock('../../../../../modules/auth/model/Auth', () => ({ __esModule: true, default: {} }));

const id = '507f1f77bcf86cd799439011';
const mockFindOne = CharacterModel.findOne as jest.Mock;
const mockAbilities = buildEffectiveAbilities as jest.Mock;
let server: Server;
let origin: string;

const fixture = () => ({
  _id: id, name: 'Ash of Everpine', status: 'active', player: 'private-player', campaign: 'private-campaign',
  forkedFrom: 'private-origin', meta: { deletedAt: null }, internalSecret: 'never-public', updatedAt: '2026-09-26T12:00:00Z',
  sheet: {
    weaveLevel: 0, dtn: 13, aspects: { might: { strength: 1, presence: 0 } },
    resources: { hp: { current: 9, max: 13, temp: 2 }, threads: { current: 1, max: 3 }, other: { armor: 2 } },
    skills: { survival: 1 }, features: [], inventory: [], learnedAbilities: [], conditions: [],
    noteCards: [{ title: 'Private journal', body: 'A secret' }], futurePrivateField: 'never-public',
  },
});

beforeAll(async () => {
  const app = express();
  app.use('/characters', characterRoutes);
  app.use((error: { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ success: false });
  });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
beforeEach(() => {
  jest.clearAllMocks();
  mockFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(fixture()) });
  mockAbilities.mockResolvedValue([{ abilityKey: 'second-wind', name: 'Second Wind', available: true }]);
});

it('serves an anonymous character card with saved stats and without private fields', async () => {
  const response = await fetch(`${origin}/characters/${id}/public`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const { payload } = await response.json();
  expect(payload.sheet.resources.hp).toEqual({ current: 9, max: 13, temp: 2 });
  expect(payload.sheet.dtn).toBe(13);
  expect(payload.derived.effectiveAbilities).toEqual([]);
  for (const key of ['player', 'campaign', 'forkedFrom', 'meta', 'internalSecret']) expect(payload).not.toHaveProperty(key);
  expect(payload.sheet).not.toHaveProperty('noteCards');
  expect(payload.sheet).not.toHaveProperty('futurePrivateField');
  expect(mockFindOne).toHaveBeenCalledWith({ _id: id, 'meta.deletedAt': null });
  expect(mockAbilities).not.toHaveBeenCalled();
});

it('enriches learned and item-granted abilities for public readers', async () => {
  const character = { ...fixture(), sheet: { ...fixture().sheet, learnedAbilities: [{ abilityKey: 'second-wind', abilityId: id, sourceType: 'learned' }] } };
  mockFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(character) });
  const response = await fetch(`${origin}/characters/${id}/public`);
  const { payload } = await response.json();
  expect(response.status).toBe(200);
  expect(payload.derived.effectiveAbilities[0].name).toBe('Second Wind');
  expect(mockAbilities).toHaveBeenCalledWith({ learnedAbilities: character.sheet.learnedAbilities, inventory: [] });
});

it('returns 400 for unsupported slug lookup without querying the database', async () => {
  const response = await fetch(`${origin}/characters/ash-of-everpine/public`);
  expect(response.status).toBe(400);
  expect(mockFindOne).not.toHaveBeenCalled();
});

it('returns 404 for missing or soft-deleted characters', async () => {
  mockFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  const response = await fetch(`${origin}/characters/${id}/public`);
  expect(response.status).toBe(404);
  expect(mockFindOne).toHaveBeenCalledWith({ _id: id, 'meta.deletedAt': null });
});

it('does not expose database errors', async () => {
  mockFindOne.mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error('private database details')) });
  const response = await fetch(`${origin}/characters/${id}/public`);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('private database details');
});

it.each([
  ['GET', '/characters'], ['GET', `/characters/${id}`], ['POST', '/characters'],
  ['PUT', `/characters/${id}`], ['DELETE', `/characters/${id}`],
  ['POST', `/characters/${id}/apply-harm`], ['POST', `/characters/${id}/fork`],
  ['POST', `/characters/${id}/public`], ['PUT', `/characters/${id}/public`], ['DELETE', `/characters/${id}/public`],
])('keeps anonymous %s %s behind the existing auth guard', async (method, path) => {
  const response = await fetch(`${origin}${path}`, { method });
  expect(response.status).toBe(401);
  expect(mockFindOne).not.toHaveBeenCalled();
});
