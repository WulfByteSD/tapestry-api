import { createHash } from 'crypto';
import { ClientSession } from 'mongoose';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { eventBus } from '../../../../lib/eventBus';
import DiceRollerService from '../../utils/diceRoller/DiceRollerService';
import RollLogModel from '../../characters/model/RollLog';
import ChatMessageModel from '../../campaigns/model/ChatMessageModel';
import { prepareDiscordRollDelivery } from '../../campaigns/handlers/DiscordRollDelivery.handler';
import { EncounterExchangeModel, exchangeDto } from '../models/EncounterExchange.model';
import { EncounterSceneModel } from '../models/EncounterScene.model';
import { eligibleCharacter, role, sceneContext, sid } from '../utils/sceneAccess';
import { sceneTransaction } from '../utils/sceneTransaction';
import { publishScene, requireOpen } from './EncounterScene.handler';
import { objectId, parse } from '../utils/contracts';
import { participantNames } from '../utils/participantNames';
import { sceneCharacterDefense } from '../utils/sceneCharacterDefense';

const aspects: Record<string, string> = {
  strength: 'might.strength',
  presence: 'might.presence',
  agility: 'finesse.agility',
  charm: 'finesse.charm',
  instinct: 'wit.instinct',
  knowledge: 'wit.knowledge',
  willpower: 'resolve.willpower',
  empathy: 'resolve.empathy',
};
export function canonicalAspect(key: string) {
  const value = aspects[key] ?? key;
  if (!Object.values(aspects).includes(value)) throw new ErrorUtil('Choose a valid Aspect.', 400);
  return value;
}
const hash = (input: any) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
export default class EncounterExchangeHandler {
  private roller = new DiceRollerService();
  private async roll(
    ctx: any,
    player: string,
    character: any,
    input: any,
    modifier: number,
    aspectKey: string,
    session: ClientSession,
    rollType: 'attack' | 'defense',
    actorName: string
  ) {
    const roll = await this.roller.rollAdvanced({
      diceCount: 3,
      faces: 6,
      edge: !!input.edge && !input.burden,
      burden: !!input.burden && !input.edge,
      operations: [{ operator: '+', value: modifier }],
    });
    if (roll.error) throw new ErrorUtil('The roll could not be completed.', 503);
    const discordDelivery =
      ctx.scene.visibility === 'campaign' ? await prepareDiscordRollDelivery({ id: sid(ctx.campaign._id), name: ctx.campaign.name }, player, actorName) : undefined;
    const [log] = await RollLogModel.create(
      [
        {
          character: character ? character._id : null,
          actorNameSnapshot: actorName,
          player,
          campaign: ctx.campaign._id,
          scene: ctx.scene._id,
          encounter: ctx.encounter._id,
          sceneVisibility: ctx.scene.visibility,
          expression: roll.expression,
          allRolls: roll.allRolls,
          keptRolls: roll.keptRolls,
          total: roll.total,
          breakdown: roll.breakdown,
          rollType,
          aspectUsed: aspectKey,
          context: ctx.rollContext ?? `${ctx.encounter.title} / ${ctx.scene.title}`,
          rolledAt: new Date(),
          ...(discordDelivery ? { discordDelivery } : {}),
        },
      ],
      { session }
    );
    return {
      id: sid(log._id),
      total: roll.total,
      allRolls: roll.allRolls,
      keptRolls: roll.keptRolls,
      breakdown: roll.breakdown,
      expression: roll.expression,
      aspectUsed: aspectKey,
      rolledAt: log.rolledAt,
    };
  }
  async list(player: string, c: string, e: string, s: string, cursor?: string) {
    await sceneContext(player, c, e, s);
    if (cursor) parse(objectId, cursor);
    const rows = await EncounterExchangeModel.find({ scene: s, ...(cursor ? { _id: { $lt: cursor } } : {}) })
      .sort({ _id: -1 })
      .limit(51)
      .lean();
    return { items: rows.slice(0, 50).map(exchangeDto), nextCursor: rows.length > 50 ? sid(rows[49]._id) : null };
  }
  async attack(player: string, c: string, e: string, s: string, input: any) {
    const initial = await sceneContext(player, c, e, s, undefined, true);
    requireOpen(initial.scene);
    const requestHash = hash(input),
      prior = await EncounterExchangeModel.findOne({ scene: s, player, requestKey: input.requestKey }).lean();
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ErrorUtil('Request key already used for another attack.', 409);
      return exchangeDto(prior);
    }
    let exchangeId: string,
      created = false;
    try {
      exchangeId = await sceneTransaction(async (session) => {
        created = false;
        const ctx = await sceneContext(player, c, e, s, false, true, session);
        requireOpen(ctx.scene);
        const existing = await EncounterExchangeModel.findOne({ scene: s, player, requestKey: input.requestKey }).session(session).lean();
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ErrorUtil('Request key already used for another attack.', 409);
          return sid(existing._id);
        }
        if (role(ctx.campaign, player) === 'observer') throw new ErrorUtil('Observers cannot attack.', 403);
        const actor = ctx.encounter.participants.find((p: any) => p.id === input.actorParticipantId && ctx.scene.participantIds.includes(p.id));
        const target = ctx.encounter.participants.find((p: any) => p.id === input.targetParticipantId && ctx.scene.participantIds.includes(p.id));
        if (!actor || !target || actor.id === target.id) throw new ErrorUtil('Choose two different cast participants in this scene.', 400);
        if ([actor, target].some((p) => p.kind === 'combatant' && !ctx.scene.revealedParticipantIds.includes(p.id)))
          throw new ErrorUtil('Reveal the combatant before acting in this scene.', 400);
        const character = actor.kind === 'character' ? await eligibleCharacter(ctx.campaign, actor.provenance.id, session) : null;
        if (actor.kind === 'character' && (!character || sid(character.player) !== player)) throw new ErrorUtil('Only the character owner may act as this cast character.', 403);
        if (actor.kind === 'combatant' && !ctx.manager) throw new ErrorUtil('Only Storyweavers may act as scene combatants.', 403);
        if (actor.kind === 'character' && target.kind !== 'combatant') throw new ErrorUtil('Choose a revealed NPC target.', 400);
        const targetCharacter = target.kind === 'character' ? await eligibleCharacter(ctx.campaign, target.provenance.id, session) : null;
        if (target.kind === 'character' && !targetCharacter) throw new ErrorUtil('The target must remain an active attached cast character.', 400);
        if (character && (input.aspectValue !== undefined || input.combatantAttackIndex !== undefined)) throw new ErrorUtil('Character Approaches use current sheet values.', 400);
        if (!character && (input.skillKey !== undefined || input.weaponInstanceId !== undefined || input.attackProfileKey !== undefined))
          throw new ErrorUtil('Combatants use an Aspect modifier and their own attack profiles.', 400);
        if (!character && (!Number.isInteger(input.aspectValue) || Math.abs(input.aspectValue) > 20))
          throw new ErrorUtil('Enter the combatant Aspect modifier between -20 and 20.', 400);
        let aspectKey = input.aspectKey,
          equipment = 0,
          skillKey = input.skillKey,
          weaponName: string | undefined,
          profileName: string | undefined;
        let combatantProfile: any;
        if (input.combatantAttackIndex !== undefined) {
          if (!Number.isInteger(input.combatantAttackIndex) || input.combatantAttackIndex < 0 || !actor.snapshot.attacks?.[input.combatantAttackIndex])
            throw new ErrorUtil('Choose a current combatant attack.', 400);
          combatantProfile = actor.snapshot.attacks[input.combatantAttackIndex];
          profileName = combatantProfile.name;
        }
        if (input.weaponInstanceId) {
          const weapon = character.sheet.inventory.find((i: any) => i.instanceId === input.weaponInstanceId && i.equipped && i.category === 'weapon' && i.qty > 0);
          if (!weapon) throw new ErrorUtil('Choose an equipped weapon from your current sheet.', 400);
          const profile = weapon.attackProfiles?.find((p: any) => p.key === (input.attackProfileKey ?? weapon.selectedAttackProfileKey));
          if (!profile) throw new ErrorUtil('Choose a current attack profile on that weapon.', 400);
          aspectKey = aspectKey ?? profile.defaultAspect;
          if (skillKey && profile.allowedSkillKeys?.length && !profile.allowedSkillKeys.includes(skillKey))
            throw new ErrorUtil('That skill is not allowed by this attack profile.', 400);
          equipment = Number(profile.modifier ?? 0) + Number(weapon.overrides?.modifier ?? 0);
          weaponName = weapon.overrides?.displayName ?? weapon.name ?? weapon.itemKey;
          profileName = profile.name;
        } else if (input.attackProfileKey) throw new ErrorUtil('An attack profile requires an equipped weapon.', 400);
        if (!aspectKey) throw new ErrorUtil('Choose an Aspect for this Approach.', 400);
        aspectKey = canonicalAspect(aspectKey);
        const [group, key] = aspectKey.split('.');
        const aspect = character ? Number(character.sheet.aspects[group]?.[key] ?? 0) : input.aspectValue;
        const skill = skillKey ? Number(character.sheet.skills instanceof Map ? character.sheet.skills.get(skillKey) : character.sheet.skills?.[skillKey]) : 0;
        if (skillKey && !Number.isFinite(skill)) throw new ErrorUtil('Choose a skill present on your current sheet.', 400);
        const modifier = aspect + skill + equipment + (input.modifier ?? 0);
        if (!Number.isFinite(modifier) || Math.abs(modifier) > 1000) throw new ErrorUtil('Invalid current character modifiers.', 400);
        // Lock the scene against lifecycle/transfer edits for the duration of the transaction.
        const lock = await EncounterSceneModel.updateOne({ _id: s, revision: ctx.scene.revision, status: 'open' }, { $inc: { revision: 1 } }, { session });
        if (!lock.modifiedCount) throw new ErrorUtil('Scene changed. Reload before rolling.', 409);
        const names = participantNames(
          ctx.encounter.participants.filter((p: any) => ctx.scene.participantIds.includes(p.id) && (p.kind === 'character' || ctx.scene.revealedParticipantIds.includes(p.id)))
        );
        const targetName = targetCharacter?.name ?? names.get(target.id) ?? target.snapshot.name,
          actorName = character?.name ?? names.get(actor.id) ?? actor.snapshot.name;
        const attack = await this.roll(
          {
            ...ctx,
            rollContext: `${ctx.encounter.title} / ${ctx.scene.title}: ${actorName} attacks ${targetName}${ctx.scene.mode === 'opposed' ? ' (opposed defense pending)' : ''}`,
          },
          player,
          character,
          input,
          modifier,
          aspectKey,
          session,
          'attack',
          actorName
        );
        const targetNumber = targetCharacter ? sceneCharacterDefense(targetCharacter) : target.snapshot.statline.defenseTN,
          status = ctx.scene.mode === 'opposed' ? 'pending' : 'resolved',
          outcome = status === 'pending' ? null : attack.total >= targetNumber ? 'hit' : 'miss';
        if (ctx.scene.mode === 'defense_tn')
          await RollLogModel.updateOne(
            { _id: attack.id },
            {
              $set: {
                attack: {
                  targetNumber,
                  margin: attack.total - targetNumber,
                  outcome,
                  targetLabel: targetName,
                  weaponInstanceId: input.weaponInstanceId,
                  weaponNameSnapshot: weaponName,
                  attackProfileKey: input.attackProfileKey,
                  attackNameSnapshot: profileName,
                },
              },
            },
            { session }
          );
        const [exchange] = await EncounterExchangeModel.create(
          [
            {
              campaign: c,
              encounter: e,
              scene: s,
              player,
              requestKey: input.requestKey,
              requestHash,
              mode: ctx.scene.mode,
              actorParticipantId: actor.id,
              targetParticipantId: target.id,
              actorKind: actor.kind,
              targetKind: target.kind,
              targetCharacterId: targetCharacter ? sid(targetCharacter._id) : undefined,
              actorName,
              targetName,
              status,
              outcome,
              targetNumber: ctx.scene.mode === 'defense_tn' ? targetNumber : undefined,
              attack: {
                ...attack,
                modifierBreakdown: { aspect, skill, equipment, manual: input.modifier ?? 0 },
                weaponName,
                profileName,
                ...(combatantProfile ? { harm: combatantProfile.harm, range: combatantProfile.range } : {}),
              },
            },
          ],
          { session }
        );
        if (ctx.scene.channel)
          await ChatMessageModel.create(
            [
              {
                campaign: c,
                channel: ctx.scene.channel,
                clientMessageId: `exchange:${sid(exchange._id)}`,
                author: { player, displayName: 'Encounter' },
                speaker: { type: 'narrator', characterName: 'Encounter' },
                content: 'Encounter exchange',
                systemEntry: { type: 'encounter_exchange', exchangeId: exchange._id },
              },
            ],
            { session }
          );
        created = true;
        return sid(exchange._id);
      });
    } catch (error: any) {
      if (error.code === 11000) {
        const raced = await EncounterExchangeModel.findOne({ scene: s, player, requestKey: input.requestKey, requestHash }).lean();
        if (!raced) throw new ErrorUtil('Request key already used for another attack.', 409);
        exchangeId = sid(raced._id);
      } else throw error;
    }
    const exchange: any = await EncounterExchangeModel.findById(exchangeId!).lean();
    if (created) await this.publish(player, c, e, s, exchange, 'attack');
    return exchangeDto(exchange);
  }
  async defend(player: string, c: string, e: string, s: string, x: string, input: any) {
    parse(objectId, x);
    const requestHash = hash(input);
    let newlyResolved = false;
    await sceneTransaction(async (session) => {
      newlyResolved = false;
      const ctx = await sceneContext(player, c, e, s, false, true, session);
      requireOpen(ctx.scene);
      const exchange: any = await EncounterExchangeModel.findOne({ _id: x, scene: s, encounter: e }).session(session).lean();
      if (!exchange) throw new ErrorUtil('Exchange not found.', 404);
      const target = ctx.encounter.participants.find((p: any) => p.id === exchange.targetParticipantId && ctx.scene.participantIds.includes(p.id));
      const character = target?.kind === 'character' ? await eligibleCharacter(ctx.campaign, target.provenance.id, session) : null;
      if (role(ctx.campaign, player) === 'observer' || (!ctx.manager && (!character || sid(character.player) !== player)))
        throw new ErrorUtil('Only the defending character owner or a Storyweaver may resolve this defense.', 403);
      if (!target || (target.kind === 'character' && !character)) throw new ErrorUtil('The defending participant is no longer eligible.', 409);
      if (character && input.aspectValue !== undefined) throw new ErrorUtil('Character defense uses current sheet Aspect values.', 400);
      if (!character && (!Number.isInteger(input.aspectValue) || Math.abs(input.aspectValue) > 20 || input.skillKey !== undefined))
        throw new ErrorUtil('Enter the combatant Aspect modifier between -20 and 20.', 400);
      if (exchange.status !== 'pending') {
        if (exchange.defenseRequestKey === input.requestKey && exchange.defenseRequestHash === requestHash) return;
        throw new ErrorUtil('This exchange has already resolved or was cancelled.', 409);
      }
      if (exchange.mode !== 'opposed') throw new ErrorUtil('This exchange does not need an opposed defense.', 400);
      if (!ctx.scene.participantIds.includes(exchange.actorParticipantId) || !ctx.scene.participantIds.includes(exchange.targetParticipantId))
        throw new ErrorUtil('An exchange participant has left this scene.', 409);
      const lock = await EncounterSceneModel.updateOne({ _id: s, revision: ctx.scene.revision, status: 'open' }, { $inc: { revision: 1 } }, { session });
      if (!lock.modifiedCount) throw new ErrorUtil('Scene changed. Reload before rolling.', 409);
      const aspectKey = canonicalAspect(input.aspectKey),
        [group, key] = aspectKey.split('.');
      const aspect = character ? Number(character.sheet.aspects[group]?.[key] ?? 0) : input.aspectValue;
      const skill =
        character && input.skillKey ? Number(character.sheet.skills instanceof Map ? character.sheet.skills.get(input.skillKey) : character.sheet.skills?.[input.skillKey]) : 0;
      if (!Number.isFinite(skill)) throw new ErrorUtil('Choose a skill present on the defending character sheet.', 400);
      const defense = await this.roll(
        { ...ctx, rollContext: `${ctx.encounter.title} / ${ctx.scene.title}: ${exchange.targetName} defends against ${exchange.actorName}` },
        player,
        character,
        input,
        aspect + skill + (input.modifier ?? 0),
        aspectKey,
        session,
        'defense',
        exchange.targetName
      );
      const outcome = exchange.attack.total > defense.total ? 'hit' : 'miss';
      await RollLogModel.updateOne(
        { _id: defense.id },
        {
          $set: {
            context: `${ctx.encounter.title} / ${ctx.scene.title}: ${exchange.targetName} defense ${defense.total} vs ${exchange.actorName} attack ${exchange.attack.total} — ${outcome}`,
          },
        },
        { session }
      );
      const result = await EncounterExchangeModel.updateOne(
        { _id: x, status: 'pending' },
        {
          $set: {
            status: 'resolved',
            outcome,
            defense: { ...defense, modifierBreakdown: { aspect, skill, equipment: 0, manual: input.modifier ?? 0 } },
            defenseRequestKey: input.requestKey,
            defenseRequestHash: requestHash,
          },
        },
        { session }
      );
      if (!result.modifiedCount) throw new ErrorUtil('This exchange has already resolved.', 409);
      newlyResolved = true;
    });
    const exchange = await EncounterExchangeModel.findById(x).lean();
    if (newlyResolved) await this.publish(player, c, e, s, exchange, 'defense');
    return exchangeDto(exchange);
  }
  private async publish(player: string, c: string, e: string, s: string, exchange: any, which: 'attack' | 'defense') {
    const ctx = await sceneContext(player, c, e, s);
    if (ctx.scene.visibility === 'campaign') {
      const roll = exchange[which];
      const actor = ctx.encounter.participants.find(
        (p: any) => p.id === (which === 'attack' ? exchange.actorParticipantId : exchange.targetParticipantId) && p.kind === 'character'
      );
      try {
        await eventBus.publish('game.dice.rolled', {
          rollId: roll.id,
          characterId: actor?.provenance.id ?? null,
          playerId: player,
          campaignId: c,
          total: roll.total,
          rollType: which,
          attackOutcome: exchange.outcome,
        });
      } catch {}
    }
    await publishScene(s, 'encounter:exchangeUpdated');
  }
}
