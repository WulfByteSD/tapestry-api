import AdventureAuthoringHandler from '../handlers/AdventureAuthoring.handler';
import AdventureReferenceHandler from '../handlers/AdventureReference.handler';
import AdventureSharingHandler from '../handlers/AdventureSharing.handler';
import AdventureAttachmentHandler from '../handlers/AdventureAttachment.handler';
import AdventureAccessHandler from '../handlers/AdventureAccess.handler';
import { adventureView, materialView } from '../helpers/adventure.helpers';
import { Adventure } from '../models/AdventureModel';
import { AdventureShare } from '../models/AdventureShareModel';
import { contentInput, createInput, updateInput } from '../types/adventure.contracts';
import Player from '../../../profiles/player/model/PlayerModel';
import Campaign from '../../campaigns/model/CampaignModel';
import Combatant from '../../content/model/CombatantModel';
import Resource from '../../../library/models/Resource';
import RAG from '../../../library/models/RAG';
import { RAGHandler } from '../../../library/handlers/Rag.handler';
import CampaignMutationHandler from '../../campaigns/handlers/CampaignMutation.handler';
import { createAdventureRoutes } from '../routes/index';
import AdventureStorageHandler from '../handlers/AdventureStorage.handler';

jest.mock('../../../../middleware/AuthMiddleware', () => ({ AuthMiddleware: {
  protect: (req: any, res: any, next: any) => req.user ? next() : res.status(401).json({ message: 'Authentication required' }),
} }));

const aid = '111111111111111111111111';
const rid = '222222222222222222222222';
const pid = '333333333333333333333333';
const cid = '444444444444444444444444';
const bid = '555555555555555555555555';
const supplier = '888888888888888888888888';
const admin = { userId: '666666666666666666666666', permissions: ['admin'] };
const user = { userId: '777777777777777777777777', permissions: [] };
const lean = (value: unknown): any => ({ lean: jest.fn().mockResolvedValue(value), select: jest.fn().mockReturnThis() });
const asset = { publicId: 'PRIVATE_STORAGE_KEY', resourceType: 'raw' as const, format: 'pdf', contentType: 'application/pdf', bytes: 99 };
const sample = () => {
  const content = contentInput.parse({ title: 'Adventure',
    sections: [
      { id: 'a', title: 'A', links: [{ sectionId: 'c', label: 'Skip B' }], resourceIds: ['map'], storyweaverNotes: 'PRIVATE_SECTION_NOTE' },
      { id: 'b', title: 'B' }, { id: 'c', title: 'C', links: [{ sectionId: 'a', label: 'Revisit A' }] },
    ],
    resources: [{ id: 'map', title: 'Shared map', kind: 'map', visibility: 'players' },
      { id: 'unshared', title: 'Unrevealed', kind: 'handout', visibility: 'players' },
      { id: 'notes', title: 'Private', kind: 'storyweaver_note', text: 'PRIVATE_RESOURCE_NOTE' }],
    encounters: [{ id: 'ambush', title: 'Ambush', combatants: [{ combatantId: bid, quantity: 3 }] }],
  });
  return { _id: aid, libraryResourceId: rid, status: 'published' as const, revision: 0,
    publishedRevision: 0, ...content, publishedContent: structuredClone(content) };
};

const authoring = new AdventureAuthoringHandler();
const reference = new AdventureReferenceHandler();
const sharing = new AdventureSharingHandler();
const attachments = new AdventureAttachmentHandler();
const access = new AdventureAccessHandler();
let adventure: ReturnType<typeof sample>;
let campaign: any;
beforeEach(() => {
  jest.restoreAllMocks();
  adventure = sample();
  campaign = { _id: cid, status: 'active', owner: 'other', members: [{ player: pid, role: 'player' }] };
  jest.spyOn(Adventure, 'findById').mockImplementation(() => lean(adventure));
  jest.spyOn(Player, 'findOne').mockImplementation(() => lean({ _id: pid, roles: ['storyweaver'] }));
  jest.spyOn(Resource, 'findOne').mockImplementation(() => lean({ _id: rid, status: 'published' }));
  jest.spyOn(RAG, 'exists').mockImplementation((query: any): any => Promise.resolve(query.userId === supplier ? { _id: rid } : null));
  jest.spyOn(Campaign, 'findById').mockImplementation(() => lean(campaign));
  jest.spyOn(AdventureShare, 'findOne').mockReturnValue(lean({ campaignId: cid, adventureId: aid, resourceId: 'map', sharedByPlayerId: supplier }));
  jest.spyOn(AdventureShare, 'updateOne').mockResolvedValue({ acknowledged: true } as any);
  jest.spyOn(AdventureShare, 'deleteOne').mockResolvedValue({ acknowledged: true, deletedCount: 1 });
  jest.spyOn(Combatant, 'countDocuments').mockResolvedValue(1);
});

describe('validated authoring', () => {
  it('accepts branching and revisit cycles, empty sections and independent optional resources', () => {
    expect(contentInput.parse({ title: 'Empty' }).sections).toEqual([]);
    const { publishedContent: content } = sample();
    expect(contentInput.parse(content).sections[2].links[0].sectionId).toBe('a');
  });
  it.each(['resourceIds', 'encounterIds'])('rejects foreign %s associations', field => {
    expect(contentInput.safeParse({ title: 'Bad', sections: [{ id: 'a', title: 'A', [field]: ['other-adventure-resource'] }] }).success).toBe(false);
  });
  it('rejects foreign section links, duplicate IDs, unsafe notes, invalid quantities and supplied storage URLs', () => {
    const invalid = [
      { sections: [{ id: 'a', title: 'A', links: [{ sectionId: 'foreign', label: 'x' }] }] },
      { sections: [{ id: 'a', title: 'A' }, { id: 'a', title: 'Duplicate' }] },
      { resources: [{ id: 'note', title: 'N', kind: 'storyweaver_note', visibility: 'players' }] },
      { resources: [{ id: 'map', title: 'M', kind: 'map', asset: { publicId: 'foreign' } }] },
      { resources: [{ id: 'map', title: 'M', kind: 'map', url: 'https://public.example/map' }] },
      { encounters: [{ id: 'fight', title: 'Fight', combatants: [{ combatantId: bid, quantity: 0 }] }] },
    ];
    for (const data of invalid) expect(contentInput.safeParse({ title: 'Bad', ...data }).success).toBe(false);
    expect(updateInput.safeParse({ revision: 0, content: { title: 'T' }, status: 'published' }).success).toBe(false);
    expect(createInput.safeParse({ libraryResourceId: 'bad', content: { title: 'T' } }).success).toBe(false);
  });
  it('requires admin authority before authoring', async () => {
    await expect(authoring.create(user, {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(authoring.update(user, aid, {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(authoring.changeStatus(user, aid, {})).rejects.toMatchObject({ statusCode: 403 });
  });
  it('checks canonical combatant existence before creating', async () => {
    (Combatant.countDocuments as jest.Mock).mockResolvedValue(0);
    const create = jest.spyOn(Adventure, 'create');
    await expect(authoring.create(admin, { libraryResourceId: rid, content: { title: 'T', encounters: adventure.encounters } }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(create).not.toHaveBeenCalled();
  });
  it('requires published combatants and protected maps when publishing', async () => {
    await expect(authoring.changeStatus(admin, aid, { revision: 0, status: 'published' })).rejects.toMatchObject({ statusCode: 400 });
    expect(Combatant.countDocuments).toHaveBeenCalledWith({ _id: { $in: [bid] }, status: 'published' });
  });
  it('detects stale concurrent draft writes', async () => {
    (adventure as any).status = 'draft';
    jest.spyOn(Adventure, 'findOneAndUpdate').mockResolvedValue(null);
    await expect(authoring.update(admin, aid, { revision: 4, content: { title: 'Updated' } })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('ownership and sharing', () => {
  it('denies nonowners and guessed IDs without exposing module contents', async () => {
    await expect(reference.ownerRead(user, aid)).rejects.toMatchObject({ statusCode: 404 });
    await expect(reference.ownerRead(user, 'not-an-id')).rejects.toMatchObject({ statusCode: 400 });
    (Adventure.findById as jest.Mock).mockReturnValue(lean(null));
    await expect(reference.ownerRead(user, bid)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('checks profile-based grants with active, view and expiry conditions', async () => {
    (RAG.exists as jest.Mock).mockResolvedValue({ _id: rid });
    await reference.ownerRead(user, aid);
    expect(RAG.exists).toHaveBeenCalledWith(expect.objectContaining({ userId: pid, resourceId: rid, status: 'active', permissions: 'view',
      $or: expect.arrayContaining([{ expiresAt: { $gt: expect.any(Date) } }]) }));
  });
  it.each(['draft', 'archived'])('denies %s modules even to entitled admins on owner routes', async status => {
    (adventure as any).status = status;
    (RAG.exists as jest.Mock).mockResolvedValue({ _id: rid });
    await expect(reference.ownerRead(admin, aid)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('denies unavailable library parents', async () => {
    (Resource.findOne as jest.Mock).mockReturnValue(lean(null));
    (RAG.exists as jest.Mock).mockResolvedValue({ _id: rid });
    await expect(reference.ownerRead(user, aid)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('grants only the explicitly shared material, never full module access', async () => {
    expect((await sharing.sharedRead(user, cid, aid, 'map')).id).toBe('map');
    expect(AdventureShare.findOne).toHaveBeenCalledWith({ campaignId: cid, adventureId: aid, resourceId: 'map' });
    await expect(reference.ownerRead(user, aid)).rejects.toMatchObject({ statusCode: 404 });
    (AdventureShare.findOne as jest.Mock).mockReturnValue(lean(null));
    await expect(sharing.sharedRead(user, cid, aid, 'unshared')).rejects.toMatchObject({ statusCode: 404 });
    await expect(sharing.sharedRead(user, cid, aid, 'foreign')).rejects.toMatchObject({ statusCode: 404 });
  });
  it.each(['draft', 'archived', 'deleted', 'removed'])('revokes derived access after campaign is %s', async state => {
    if (state === 'deleted') campaign = null;
    else if (state === 'removed') campaign.members = [];
    else campaign.status = state;
    await expect(sharing.sharedRead(user, cid, aid, 'map')).rejects.toMatchObject({ statusCode: 404 });
  });
  it.each(['deleted', 'removed', 'archived'])('retains independent owner access when campaign is %s', async state => {
    if (state === 'deleted') campaign = null;
    else if (state === 'removed') campaign.members = [];
    else campaign.status = state;
    (RAG.exists as jest.Mock).mockResolvedValue({ _id: rid });
    expect((await sharing.sharedRead(user, cid, aid, 'map')).id).toBe('map');
    expect((await reference.ownerRead(user, aid))._id).toBe(aid);
  });
  it('never returns private notes or storage identifiers on campaign projections', async () => {
    await expect(sharing.sharedRead(user, cid, aid, 'notes')).rejects.toMatchObject({ statusCode: 404 });
    (RAG.exists as jest.Mock).mockResolvedValue({ _id: rid });
    await expect(sharing.sharedRead(user, cid, aid, 'notes')).rejects.toMatchObject({ statusCode: 404 });
    const resource = { ...adventure.resources[0], asset, surprisePrivateField: 'SECRET' };
    const json = JSON.stringify(materialView(resource));
    expect(json).not.toMatch(/PRIVATE|SECRET|publicId|resourceIds|encounter/);
    expect(JSON.stringify(adventureView({ ...adventure, resources: [resource] }))).not.toContain(asset.publicId);
  });
  it('lists only shared safe resources even if a stored share erroneously includes private notes', async () => {
    jest.spyOn(AdventureShare, 'find').mockReturnValue(lean(['map', 'notes'].map(resourceId => ({ adventureId: aid, resourceId, sharedByPlayerId: supplier }))));
    jest.spyOn(Adventure, 'find').mockReturnValue(lean([adventure]));
    jest.spyOn(Resource, 'find').mockReturnValue(lean([{ _id: rid }]));
    const result = await sharing.sharedList(user, cid);
    expect(result.map(entry => entry.id)).toEqual(['map']);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|Unrevealed|storyweaverNotes|encounter/);
  });
  it('rejects campaign sharing for archived campaigns and foreign material IDs', async () => {
    (RAG.exists as jest.Mock).mockResolvedValue({ _id: rid }); campaign.owner = pid;
    await expect(sharing.share(user, cid, aid, 'foreign-map')).rejects.toMatchObject({ statusCode: 404 });
    campaign.status = 'archived';
    await expect(sharing.share(user, cid, aid, 'map')).rejects.toMatchObject({ statusCode: 404 });
    expect(AdventureShare.updateOne).not.toHaveBeenCalled();
  });
  it('requires both ownership and campaign management authority to share', async () => {
    await expect(sharing.share(user, cid, aid, 'map')).rejects.toMatchObject({ statusCode: 404 });
    (RAG.exists as jest.Mock).mockResolvedValue({ _id: rid });
    await expect(sharing.share(user, cid, aid, 'map')).rejects.toMatchObject({ statusCode: 404 });
    campaign.members[0].role = 'co-sw';
    expect((await sharing.share(user, cid, aid, 'map')).id).toBe('map');
    await expect(sharing.share(user, cid, aid, 'notes')).rejects.toMatchObject({ statusCode: 404 });
  });
  it('makes repeat shares/unshares idempotent and handles concurrent first-share races', async () => {
    (RAG.exists as jest.Mock).mockResolvedValue({ _id: rid }); campaign.owner = pid;
    (AdventureShare.updateOne as jest.Mock).mockRejectedValueOnce({ code: 11000 });
    await sharing.share(user, cid, aid, 'map'); await sharing.share(user, cid, aid, 'map');
    expect(AdventureShare.updateOne).toHaveBeenCalledWith({ campaignId: cid, adventureId: aid, resourceId: 'map' }, { $setOnInsert: { sharedByPlayerId: pid } }, expect.anything());
    await sharing.unshare(user, cid, aid, 'map'); await sharing.unshare(user, cid, aid, 'map');
    expect(AdventureShare.deleteOne).toHaveBeenLastCalledWith({ campaignId: cid, adventureId: aid, resourceId: 'map' });
  });
  it('does not invent a second grant system: repeated existing grants return already_owned', async () => {
    (Player.findOne as jest.Mock).mockResolvedValue({ _id: pid });
    jest.spyOn(Resource, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: rid }) } as any);
    jest.spyOn(RAG, 'findOne').mockResolvedValue({ permissions: ['view'] } as any);
    const create = jest.spyOn(RAG, 'create');
    const handler = new RAGHandler();
    const input = { authUserId: user.userId, resourceId: rid, permissions: ['view' as const], source: { type: 'claim' as const } };
    expect((await handler.grantAccessForUser(input)).status).toBe('already_owned');
    expect((await handler.grantAccessForUser(input)).status).toBe('already_owned');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('campaign mutation boundary', () => {
  it('blocks outsiders and ordinary players from changing membership or availability', async () => {
    await expect(new CampaignMutationHandler().authorize(user.userId, cid)).rejects.toMatchObject({ statusCode: 403 });
  });
  it('allows the owner to manage an archived campaign', async () => {
    campaign.owner = pid; campaign.status = 'archived';
    await expect(new CampaignMutationHandler().authorize(user.userId, cid)).resolves.toBeUndefined();
  });
});

/** Dispatch through the real Express router without starting an HTTP listener. */
function request(path: string, who: typeof user | undefined = user, method = 'GET', body: unknown = {}) {
  const open = jest.spyOn(AdventureStorageHandler.prototype, 'open');
  const router = createAdventureRoutes();
  return new Promise<{ status: number; payload: any; open: jest.SpyInstance; headers: Record<string, string> }>(resolve => {
    const headers: Record<string, string> = {};
    const res: any = { statusCode: 200, setHeader: (key: string, value: string) => { headers[key] = value; },
      status(code: number) { this.statusCode = code; return this; },
      json(payload: any) { resolve({ status: this.statusCode, payload, open, headers }); return this; },
      end() { resolve({ status: this.statusCode, payload: undefined, open, headers }); } };
    (router as any).handle({ method, url: path, originalUrl: path, query: {}, body, headers: {},
      user: who ? { _id: who.userId, permissions: who.permissions } : undefined }, res,
    (error: any) => resolve({ status: error?.statusCode || 404, payload: error?.message, open, headers }));
  });
}
describe('HTTP contracts', () => {
  it('rejects unauthenticated and nonadmin requests', async () => {
    const result = await request('/admin', user);
    expect(result.status).toBe(403);
    const anon = await request('/', null as any);
    expect(anon.status).toBe(401);
  });
  it('opens C before B and revisits A without writing progress or requiring completion', async () => {
    (RAG.exists as jest.Mock).mockResolvedValue({ _id: rid });
    expect((await request(`/${aid}/sections/c`)).payload.payload.section.id).toBe('c');
    expect((await request(`/${aid}/sections/a`)).payload.payload.section.id).toBe('a');
    expect(AdventureShare.updateOne).not.toHaveBeenCalled();
  });
  it('filters contextual resources while retaining the independent module library', async () => {
    expect(reference.resources(adventure, { sectionId: 'a' }).map(entry => entry.id)).toEqual(['map']);
    expect(reference.resources(adventure, {}).length).toBe(3);
    expect(reference.resources(adventure, { kind: 'handout' }).map(entry => entry.id)).toEqual(['unshared']);
  });
  it('does not invoke delivery before authorization, and marks responses noncacheable', async () => {
    const result = await request(`/${aid}/resources/map/asset`);
    expect(result.status).toBe(404); expect(result.open).not.toHaveBeenCalled();
    expect(result.headers['Cache-Control']).toBe('private, no-store');
    campaign.members = [];
    const shared = await request(`/campaigns/${cid}/${aid}/resources/map/asset`);
    expect(shared.status).toBe(404); expect(shared.open).not.toHaveBeenCalled();
  });
});
