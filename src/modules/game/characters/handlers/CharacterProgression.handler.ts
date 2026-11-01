import mongoose, { ClientSession } from 'mongoose';
import CharacterModel from '../model/CharacterModel';
import WeaveAward from '../model/WeaveAward';
import CampaignModel from '../../campaigns/model/CampaignModel';
import PlayerModel from '../../../profiles/player/model/PlayerModel';
import AbilityModel from '../../content/model/AbilityDefinitionModel';
import { SkillDefinitionModel } from '../../content/model/SkillDefinition';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { initializeHPAdjustment, validateAndApplyGrowthRules } from '../helpers/characterGrowth';
import { advanceInput, awardInput, resolveInput, resetInput, parse, objectId, fingerprint } from '../helpers/progressionContracts';
import { initializeWeaveGrowth, applyWeaveGrowth, appendWeaveGrowth, growthSnapshot, previewWeaveReset, resetWeaveGrowth } from '../helpers/characterWeaveGrowth';
import { emitChatToPlayers } from '../../campaigns/chat/chatEvents';

const plain = (doc: any) => doc.toObject({ flattenMaps: true, minimize: false });
const conflict = () => new ErrorUtil('Character or award changed. Reload and review the growth before confirming again.', 409);

export default class CharacterProgressionHandler {
  async player(user: unknown) {
    const player = await PlayerModel.findOne({ user } as any).lean();
    if (!player) throw new ErrorUtil('Player profile not found.', 403);
    return player;
  }

  async owned(player: string, id: string, session?: ClientSession) {
    parse(objectId, id);
    const character = await CharacterModel.findById(id).session(session ?? null);
    if (!character) throw new ErrorUtil('Character not found.', 404);
    if (String(character.player) !== player) throw new ErrorUtil('Only the character owner can change their progression.', 403);
    return character;
  }

  async progression(player: string, id: string) {
    const character = await this.owned(player, id);
    initializeHPAdjustment(character);
    initializeWeaveGrowth(character);
    applyWeaveGrowth(character);
    validateAndApplyGrowthRules(character);
    const awards = await WeaveAward.find({ recipients: { $elemMatch: { character: id, status: 'pending' } } }).sort({ createdAt: 1 }).lean();
    return {
      character: plain(character),
      revision: character.__v ?? 0,
      pendingAwards: awards.map(award => ({ id: String(award._id), campaignId: String(award.campaign), campaignName: award.campaignName, actorName: award.actorName, note: award.note, createdAt: award.createdAt })),
      history: (character.sheet.advancementHistory ?? []).map(({ fingerprint: _fingerprint, ...entry }: any) => entry),
      resetPreview: previewWeaveReset(character),
    };
  }

  private async notify(characterIds: string[], campaignId?: string) {
    const characters = await CharacterModel.find({ _id: { $in: characterIds } }).select('player campaign').lean();
    const campaigns = await CampaignModel.find({ _id: { $in: [...new Set([campaignId, ...characters.map(c => c.campaign)].filter((id): id is string => Boolean(id)))] } }).lean();
    for (const character of characters) {
      const relevant = campaigns.filter(c => String(c._id) === String(character.campaign) || String(c._id) === campaignId);
      const managers = relevant.flatMap(c => [String(c.owner), ...c.members.filter(m => ['sw', 'co-sw'].includes(m.role)).map(m => String(m.player))]);
      emitChatToPlayers([String(character.player), ...managers], 'character:progressionUpdated', { characterId: String(character._id), campaignId: character.campaign ? String(character.campaign) : campaignId });
    }
  }

  async award(player: any, campaignId: string, raw: unknown) {
    parse(objectId, campaignId);
    const input = parse(awardInput, raw);
    input.characterIds = [...new Set(input.characterIds)].sort();
    const hash = fingerprint(input);
    const campaign = await CampaignModel.findById(campaignId).lean();
    if (!campaign) throw new ErrorUtil('Campaign not found.', 404);
    const member = campaign.members.find(m => String(m.player) === String(player._id));
    if (String(campaign.owner) !== String(player._id) && !['sw', 'co-sw'].includes(member?.role ?? '')) throw new ErrorUtil('Only campaign Storyweavers can award Weaves.', 403);
    if (campaign.status !== 'active') throw new ErrorUtil('Only active campaigns can award Weaves.', 403);
    const lookup = { campaign: campaignId, actor: player._id, requestId: input.requestId };
    const existing = await WeaveAward.findOne(lookup);
    if (existing) {
      if (existing.fingerprint !== hash) throw new ErrorUtil('Request ID was already used for a different award.', 409);
      return { awardId: String(existing._id), recipientCount: existing.recipients.length };
    }
    const characters = await CharacterModel.find({ _id: { $in: input.characterIds }, campaign: campaignId, status: 'active', 'meta.deletedAt': null }).lean();
    const members = new Set([String(campaign.owner), ...campaign.members.map(m => String(m.player))]);
    if (characters.length !== input.characterIds.length || characters.some(c => !members.has(String(c.player)))) throw new ErrorUtil('Recipients must be active characters attached to this campaign and owned by its members.', 400);
    let award;
    try {
      award = await WeaveAward.create({ ...lookup, campaignName: campaign.name, actorName: player.displayName || 'Storyweaver', fingerprint: hash, note: input.note, recipients: characters.map(c => ({ character: c._id, player: c.player, status: 'pending' })) });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      award = await WeaveAward.findOne(lookup);
      if (!award || award.fingerprint !== hash) throw conflict();
    }
    await this.notify(input.characterIds, campaignId);
    return { awardId: String(award._id), recipientCount: award.recipients.length };
  }

  async resolve(player: string, id: string, awardId: string, raw: unknown) {
    await this.owned(player, id);
    parse(objectId, awardId);
    const { status } = parse(resolveInput, raw);
    const result = await WeaveAward.updateOne({ _id: awardId, recipients: { $elemMatch: { character: id, status: 'pending' } } }, { $set: { 'recipients.$.status': status, 'recipients.$.resolvedAt': new Date() }, $inc: { __v: 1 } });
    if (!result.modifiedCount) {
      const previous = await WeaveAward.findOne({ _id: awardId, recipients: { $elemMatch: { character: id, status } } });
      if (!previous) throw conflict();
    }
    const award = await WeaveAward.findById(awardId).lean();
    await this.notify([id], award ? String(award.campaign) : undefined);
    return this.progression(player, id);
  }

  async advance(player: string, id: string, raw: unknown) {
    const input = parse(advanceInput, raw);
    const hash = fingerprint(input);
    const replay = (character: any) => {
      const receipt = character.sheet.progressionReceipts?.find((item: any) => item.requestId === input.requestId);
      if (receipt) {
        if (receipt.kind !== 'advance' || receipt.fingerprint !== hash) throw new ErrorUtil('Request ID was already used for different growth.', 409);
        if (receipt.retired) throw new ErrorUtil('This advancement was cleared by a reset. Reload before advancing again.', 409);
        return receipt;
      }
      const entry = character.sheet.advancementHistory?.find((item: any) => item.requestId === input.requestId);
      if (entry && entry.fingerprint !== hash) throw new ErrorUtil('Request ID was already used for different growth.', 409);
      return entry;
    };
    const initial = await this.owned(player, id);
    if (replay(initial)) return plain(initial);

    const perform = async (session?: ClientSession) => {
      const character = await this.owned(player, id, session);
      if (replay(character)) return plain(character);
      if ((character.__v ?? 0) !== input.expectedRevision) throw conflict();
      let award: any;
      if (input.awardId) {
        award = await WeaveAward.findOne({ _id: input.awardId, recipients: { $elemMatch: { character: id, status: 'pending' } } }).session(session ?? null);
        if (!award) throw conflict();
      }
      initializeHPAdjustment(character);
      initializeWeaveGrowth(character);
      applyWeaveGrowth(character);
      validateAndApplyGrowthRules(character);
      const before = plain(character).sheet;
      const sheet = character.sheet;
      const choice = input.choice;
      if (choice.kind === 'aspect') {
        const path = `sheet.aspects.${choice.aspect}`;
        const value = character.get(path);
        if (!Number.isSafeInteger(value) || !Number.isSafeInteger(value + 1)) throw new ErrorUtil('The next Aspect score must be a finite safe whole number.', 400);
        if (!sheet.houseRuleOverride && value >= 4) throw new ErrorUtil('Choose an Aspect below +4, or enable house-rule overrides.', 400);
        character.set(path, value + 1);
      } else if (choice.kind === 'hp') {
        // Also grants exactly +2 when a house-rule Strength has floored HP at zero.
        sheet.hpAdjustment = sheet.resources.hp.max + 2 - sheet.baseHP! - sheet.aspects.might.strength;
      } else if (choice.kind === 'threads') {
        const base = sheet.weaveGrowth.base.threadCap;
        const limit = base > Number.MAX_SAFE_INTEGER - 2 ? Number.MAX_SAFE_INTEGER : base + 2;
        if (!Number.isSafeInteger(sheet.resources.threads.max + 1)) throw new ErrorUtil('The next Thread capacity must be a finite safe whole number.', 400);
        if (!sheet.houseRuleOverride && sheet.resources.threads.max >= limit) throw new ErrorUtil(`Standard Weave growth can add up to 2 Threads above your base capacity (${base}), for a capacity of ${limit}. Enable house-rule overrides to grow further.`, 400);
        sheet.resources.threads.max += 1;
      } else if (choice.kind === 'skill') {
        const rank = character.get(`sheet.skills.${choice.skillKey}`) ?? 0;
        if (!Number.isSafeInteger(rank) || rank < 0 || !Number.isSafeInteger(rank + 1)) throw new ErrorUtil('The next Skill rank must be a nonnegative safe whole number.', 400);
        if (!sheet.houseRuleOverride && rank >= 2) throw new ErrorUtil('Standard Skills advance from untrained to +1, or from +1 to +2. Enable house-rule overrides to improve further.', 400);
        if (rank === 0) {
          const definition = await SkillDefinitionModel.findOne({ key: choice.skillKey, status: 'published' }).session(session ?? null).lean();
          if (!definition) throw new ErrorUtil('Choose an available Skill from the library.', 400);
          this.checkSetting(character, definition as any, choice.settingKey);
        }
        character.set(`sheet.skills.${choice.skillKey}`, rank + 1);
      } else if (choice.kind === 'ability') {
        const definition = await AbilityModel.findOne({ _id: choice.abilityId, status: 'published' }).session(session ?? null).lean();
        if (!definition) throw new ErrorUtil('Choose an available Ability from the library.', 400);
        this.checkSetting(character, definition, choice.settingKey);
        if (sheet.learnedAbilities.some(a => String(a.abilityId) === choice.abilityId || a.abilityKey === definition.key)) throw new ErrorUtil('This Ability is already learned. Choose refinement instead.', 400);
        sheet.learnedAbilities.push({ abilityId: choice.abilityId, abilityKey: definition.key, sourceType: 'learned', notes: '' });
      } else {
        const ability = sheet.learnedAbilities.find(a => String(a.abilityId) === choice.abilityId);
        if (!ability) throw new ErrorUtil('Only an existing learned Ability can be refined.', 400);
        ability.notes = [ability.notes, `Weave ${sheet.weaveLevel + 1}: ${choice.refinement}`].filter(Boolean).join('\n\n');
      }
      sheet.weaveLevel += 1;
      appendWeaveGrowth(character, input.requestId, choice, before);
      validateAndApplyGrowthRules(character);
      const after = plain(character).sheet;
      sheet.advancementHistory.push({ requestId: input.requestId, fingerprint: hash, awardId: input.awardId, source: award ? award.campaignName : 'Player', note: input.note || award?.note || '', choice, createdAt: new Date().toISOString(), before: growthSnapshot(before), after: growthSnapshot(after) });
      sheet.progressionReceipts.push({ requestId: input.requestId, fingerprint: hash, kind: 'advance' });
      await character.save({ session });
      if (award) {
        const recipient = award.recipients.find((r: any) => String(r.character) === id);
        recipient.status = 'applied'; recipient.resolvedAt = new Date();
        await award.save({ session });
      }
      return plain(character);
    };
    let result;
    try {
      if (input.awardId) {
        const hello = await mongoose.connection.db?.admin().command({ hello: 1 });
        if (!hello || (!hello.setName && hello.msg !== 'isdbgrid')) throw new ErrorUtil('Claiming a campaign award requires transactional storage. No changes were saved.', 503);
        const session = await mongoose.startSession();
        try { await session.withTransaction(async () => { result = await perform(session); }); }
        finally { await session.endSession(); }
      } else result = await perform();
    } catch (error: any) {
      if (error?.name === 'VersionError' || error?.statusCode === 409) {
        const latest = await this.owned(player, id);
        if (replay(latest)) result = plain(latest);
        else throw conflict();
      } else throw error;
    }
    await this.notify([id]);
    return result;
  }

  async reset(player: string, id: string, raw: unknown) {
    const input = parse(resetInput, raw);
    const hash = fingerprint(input);
    const replay = (character: any) => {
      const receipt = character.sheet.progressionReceipts?.find((item: any) => item.requestId === input.requestId);
      if (!receipt) return false;
      if (receipt.kind !== 'reset' || receipt.fingerprint !== hash) throw new ErrorUtil('Request ID was already used for a different progression change.', 409);
      return true;
    };
    const character = await this.owned(player, id);
    initializeWeaveGrowth(character);
    if (replay(character)) return plain(character);
    if ((character.__v ?? 0) !== input.expectedRevision) throw conflict();
    resetWeaveGrowth(character);
    character.sheet.progressionReceipts = character.sheet.progressionReceipts.map((receipt: any) => receipt.kind === 'advance' ? { ...receipt, retired: true } : receipt);
    character.sheet.progressionReceipts.push({ requestId: input.requestId, fingerprint: hash, kind: 'reset' });
    character.markModified('sheet.progressionReceipts');
    try { await character.save(); }
    catch (error: any) {
      if (error?.name !== 'VersionError') throw error;
      const latest = await this.owned(player, id);
      if (replay(latest)) return plain(latest);
      throw conflict();
    }
    await this.notify([id]);
    return plain(character);
  }

  private checkSetting(character: any, definition: { settingKeys: string[] }, selection?: string) {
    const setting = character.settingKey || selection;
    if (definition.settingKeys?.length && (!setting || !definition.settingKeys.includes(setting))) throw new ErrorUtil('This choice is not available in the character’s setting.', 400);
    if (!character.settingKey && selection) character.settingKey = selection;
  }
}
