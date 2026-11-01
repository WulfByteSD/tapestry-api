import { initializeHPAdjustment, validateAndApplyGrowthRules } from './characterGrowth';
import { ErrorUtil } from '../../../../middleware/ErrorUtil';

type GrowthEffect =
  | { kind: 'aspect'; aspect: string; amount: number }
  | { kind: 'hp'; amount: number }
  | { kind: 'threads'; amount: number }
  | { kind: 'skill'; skillKey: string; amount: number }
  | { kind: 'ability'; ability: any }
  | { kind: 'refinement'; abilityId: string; text: string; followingText?: string };

type GrowthEntry = { requestId: string; effects: GrowthEffect[] };
type GrowthBase = { aspects: any; hpAdjustment: number; threadCap: number; skills: Record<string, number>; learnedAbilities: any[] };
export type WeaveGrowth = { version: 1; base: GrowthBase; entries: GrowthEntry[] };

const copy = (value: any): any => JSON.parse(JSON.stringify(value instanceof Map ? Object.fromEntries(value) : value));
const valueAt = (object: any, path: string) => path.split('.').reduce((value, key) => value?.[key], object);
const setAt = (object: any, path: string, value: number) => {
  const keys = path.split('.');
  const parent = keys.slice(0, -1).reduce((item, key) => item[key] ??= {}, object);
  parent[keys[keys.length - 1]] = value;
};
const abilityId = (ability: any) => String(ability.abilityId ?? ability.abilityKey);
const sheetObject = (character: any) => character.toObject ? character.toObject({ flattenMaps: true }).sheet : copy(character.sheet);

export function growthSnapshot(sheet: any) {
  return copy({ weaveLevel: sheet.weaveLevel, aspects: sheet.aspects, hpMax: sheet.resources.hp.max, threadCap: sheet.resources.threads.max, skills: sheet.skills, learnedAbilities: sheet.learnedAbilities, dtn: sheet.dtn });
}

function baseFromSheet(sheet: any): GrowthBase {
  return copy({ aspects: sheet.aspects, hpAdjustment: sheet.hpAdjustment ?? 0, threadCap: sheet.resources.threads.max, skills: sheet.skills ?? {}, learnedAbilities: sheet.learnedAbilities ?? [] });
}

/** Only recorded server choices are converted; an unrecorded past stays in the base. */
function historicalEffects(record: any): GrowthEffect[] {
  const { choice, before, after } = record;
  if (!choice || !before || !after) return [];
  if (choice.kind === 'aspect') {
    const amount = valueAt(after.aspects, choice.aspect) - valueAt(before.aspects, choice.aspect);
    return amount === 1 ? [{ kind: 'aspect', aspect: choice.aspect, amount }] : [];
  }
  if (choice.kind === 'hp') return after.hpMax - before.hpMax === 2 ? [{ kind: 'hp', amount: 2 }] : [];
  if (choice.kind === 'threads') return after.threadCap - before.threadCap === 1 ? [{ kind: 'threads', amount: 1 }] : [];
  if (choice.kind === 'skill') {
    const amount = (after.skills?.[choice.skillKey] ?? 0) - (before.skills?.[choice.skillKey] ?? 0);
    return amount === 1 ? [{ kind: 'skill', skillKey: choice.skillKey, amount }] : [];
  }
  if (choice.kind === 'ability') {
    const ability = after.learnedAbilities?.find((item: any) => String(item.abilityId) === choice.abilityId);
    return ability && !before.learnedAbilities?.some((item: any) => abilityId(item) === abilityId(ability)) ? [{ kind: 'ability', ability: copy(ability) }] : [];
  }
  if (choice.kind === 'refineAbility') return [{ kind: 'refinement', abilityId: choice.abilityId, text: `Weave ${after.weaveLevel}: ${choice.refinement}` }];
  return [];
}

function removeText(notes: string | undefined, text: string) {
  const value = notes ?? '';
  if (value === text) return '';
  const index = value.indexOf(text);
  if (index >= 0 && (index === 0 || value.slice(index - 2, index) === '\n\n') && (index + text.length === value.length || value.slice(index + text.length, index + text.length + 2) === '\n\n')) return [value.slice(0, index).replace(/\n\n$/, ''), value.slice(index + text.length).replace(/^\n\n/, '')].filter(Boolean).join('\n\n');
  return value;
}

function subtractEffects(base: GrowthBase, effects: GrowthEffect[]) {
  for (const effect of [...effects].reverse()) {
    if (effect.kind === 'aspect') setAt(base.aspects, effect.aspect, valueAt(base.aspects, effect.aspect) - effect.amount);
    else if (effect.kind === 'hp') base.hpAdjustment -= effect.amount;
    else if (effect.kind === 'threads') base.threadCap -= effect.amount;
    else if (effect.kind === 'skill') {
      const rank = (base.skills[effect.skillKey] ?? 0) - effect.amount;
      if (rank > 0) base.skills[effect.skillKey] = rank;
      else delete base.skills[effect.skillKey];
    } else if (effect.kind === 'ability') base.learnedAbilities = base.learnedAbilities.filter(item => abilityId(item) !== abilityId(effect.ability));
    else {
      const ability = base.learnedAbilities.find(item => abilityId(item) === effect.abilityId);
      if (ability) ability.notes = removeText(ability.notes, effect.text);
    }
  }
}

export function initializeWeaveGrowth(character: any): WeaveGrowth {
  initializeHPAdjustment(character);
  if (character.sheet.weaveGrowth?.version === 1) {
    // MongoDB/Mongoose can minimize empty objects inside Mixed fields on save.
    character.sheet.weaveGrowth.base.skills ??= {};
    character.sheet.weaveGrowth.base.learnedAbilities ??= [];
    return character.sheet.weaveGrowth;
  }
  validateAndApplyGrowthRules(character);
  const sheet = sheetObject(character);
  const entries: GrowthEntry[] = (sheet.advancementHistory ?? []).map((record: any) => ({ requestId: record.requestId, effects: historicalEffects(record) }));
  // Older history did not track later manual edits. Convert only contributions
  // that can be removed without changing today's sheet during initialization.
  for (const entry of entries) entry.effects = entry.effects.filter(effect => {
    if (effect.kind === 'ability') {
      const current = sheet.learnedAbilities.find((ability: any) => abilityId(ability) === abilityId(effect.ability));
      if (!current) return false;
      effect.ability = copy(current);
      for (const refinement of entries.flatMap(item => item.effects)) if (refinement.kind === 'refinement' && refinement.abilityId === abilityId(current)) effect.ability.notes = removeText(effect.ability.notes, refinement.text);
    } else if (effect.kind === 'refinement') {
      const current = sheet.learnedAbilities.find((ability: any) => abilityId(ability) === effect.abilityId);
      if (!current || removeText(current.notes, effect.text) === (current.notes ?? '')) return false;
      const index = current.notes.indexOf(effect.text);
      let followingText = current.notes.slice(index + effect.text.length).replace(/^\n\n/, '');
      for (const refinement of entries.flatMap(item => item.effects)) if (refinement.kind === 'refinement' && refinement.abilityId === effect.abilityId) followingText = removeText(followingText, refinement.text);
      if (followingText) effect.followingText = followingText;
    }
    return true;
  });
  const base = baseFromSheet(sheet);
  for (const entry of [...entries].reverse()) {
    const kept: GrowthEffect[] = [];
    for (const effect of [...entry.effects].reverse()) {
      if (effect.kind === 'aspect' && !sheet.houseRuleOverride && valueAt(base.aspects, effect.aspect) - effect.amount < -2) continue;
      if (effect.kind === 'threads' && base.threadCap - effect.amount < 0) continue;
      if (effect.kind === 'skill' && (base.skills[effect.skillKey] ?? 0) < effect.amount) continue;
      subtractEffects(base, [effect]);
      kept.unshift(effect);
    }
    entry.effects = kept;
  }
  const healthGrowth = entries.flatMap(entry => entry.effects).reduce((sum, effect) => sum + (effect.kind === 'hp' ? effect.amount : 0), 0);
  const strengthGrowth = entries.flatMap(entry => entry.effects).reduce((sum, effect) => sum + (effect.kind === 'aspect' && effect.aspect === 'might.strength' ? effect.amount : 0), 0);
  if (Math.max(0, sheet.baseHP + base.aspects.might.strength + strengthGrowth + base.hpAdjustment) + healthGrowth !== sheet.resources.hp.max) {
    for (const entry of entries) entry.effects = entry.effects.filter(effect => effect.kind !== 'hp');
    base.hpAdjustment = sheet.hpAdjustment;
  }
  character.sheet.weaveGrowth = { version: 1, base, entries };
  character.sheet.progressionReceipts ??= [];
  for (const record of sheet.advancementHistory ?? []) {
    if (!character.sheet.progressionReceipts.some((receipt: any) => receipt.requestId === record.requestId)) character.sheet.progressionReceipts.push({ requestId: record.requestId, fingerprint: record.fingerprint, kind: 'advance' });
  }
  return character.sheet.weaveGrowth;
}

/** Materialized gameplay values are a cache of the base plus active contributions. */
export function applyWeaveGrowth(character: any) {
  const growth = initializeWeaveGrowth(character);
  const values = copy(growth.base) as GrowthBase;
  let healthGrowth = 0;
  for (const effect of growth.entries.flatMap(entry => entry.effects)) {
    if (effect.kind === 'aspect') setAt(values.aspects, effect.aspect, valueAt(values.aspects, effect.aspect) + effect.amount);
    else if (effect.kind === 'hp') healthGrowth += effect.amount;
    else if (effect.kind === 'threads') values.threadCap += effect.amount;
    else if (effect.kind === 'skill') values.skills[effect.skillKey] = (values.skills[effect.skillKey] ?? 0) + effect.amount;
    else if (effect.kind === 'ability') {
      if (!values.learnedAbilities.some(item => abilityId(item) === abilityId(effect.ability))) values.learnedAbilities.push(copy(effect.ability));
    } else {
      const ability = values.learnedAbilities.find(item => abilityId(item) === effect.abilityId);
      if (ability) {
        const notes = ability.notes ?? '';
        if (effect.followingText && notes.endsWith(effect.followingText)) ability.notes = [notes.slice(0, -effect.followingText.length).replace(/\n\n$/, ''), effect.text, effect.followingText].filter(Boolean).join('\n\n');
        else ability.notes = [notes, effect.text].filter(Boolean).join('\n\n');
      }
    }
  }
  const sheet = character.sheet;
  sheet.aspects = values.aspects;
  // Health choices remain +2 even when an overridden Strength floors base Health at zero.
  const effectiveStrength = values.aspects.might.strength;
  const maximum = Math.max(0, sheet.baseHP + effectiveStrength + values.hpAdjustment) + healthGrowth;
  sheet.hpAdjustment = maximum - sheet.baseHP - effectiveStrength;
  sheet.resources.threads.max = values.threadCap;
  sheet.skills = values.skills;
  sheet.learnedAbilities = values.learnedAbilities;
}

export function appendWeaveGrowth(character: any, requestId: string, choice: any, before: any) {
  const after = sheetObject(character);
  const record = { choice, before: growthSnapshot(before), after: growthSnapshot(after) };
  const effects = historicalEffects(record);
  if (choice.kind === 'hp') effects.splice(0, effects.length, { kind: 'hp', amount: 2 });
  character.sheet.weaveGrowth.entries.push({ requestId, effects });
  character.markModified?.('sheet.weaveGrowth');
  applyWeaveGrowth(character);
}

/** Legacy effective-value patches change the base by their delta; new editors send base explicitly. */
export function applyManualGrowthEdits(character: any, before: any, manualBase?: any) {
  const growth = initializeWeaveGrowth(character);
  const oldBaseSkills = copy(growth.base.skills) as Record<string, number>;
  const desired = baseFromSheet(sheetObject(character));
  const prior = baseFromSheet(before);
  const adjusted = copy(desired) as GrowthBase;
  subtractEffects(adjusted, growth.entries.flatMap(entry => entry.effects));
  for (const group of ['might', 'finesse', 'wit', 'resolve']) {
    for (const key of Object.keys(desired.aspects[group] ?? {})) {
      if (desired.aspects[group][key] !== prior.aspects[group]?.[key]) growth.base.aspects[group][key] = adjusted.aspects[group][key];
    }
  }
  if (desired.hpAdjustment !== prior.hpAdjustment) growth.base.hpAdjustment = adjusted.hpAdjustment;
  if (desired.threadCap !== prior.threadCap) growth.base.threadCap = adjusted.threadCap;
  if (JSON.stringify(desired.skills) !== JSON.stringify(prior.skills)) growth.base.skills = adjusted.skills;
  if (JSON.stringify(desired.learnedAbilities) !== JSON.stringify(prior.learnedAbilities)) growth.base.learnedAbilities = adjusted.learnedAbilities;
  if (manualBase) {
    for (const [group, scores] of Object.entries(manualBase.aspects ?? {})) Object.assign(growth.base.aspects[group], scores);
    if (manualBase.threadCap !== undefined) growth.base.threadCap = manualBase.threadCap;
    if (manualBase.skills !== undefined) growth.base.skills = copy(manualBase.skills);
    if (manualBase.learnedAbilities !== undefined) growth.base.learnedAbilities = copy(manualBase.learnedAbilities);
    if (manualBase.hpMax !== undefined) growth.base.hpAdjustment = manualBase.hpMax - character.sheet.baseHP - growth.base.aspects.might.strength;
  }
  validateWeaveBase(character);
  character.markModified?.('sheet.weaveGrowth');
  applyWeaveGrowth(character);
  if (!character.sheet.houseRuleOverride) {
    const effectiveSkills = character.sheet.skills instanceof Map ? Object.fromEntries(character.sheet.skills) : character.sheet.skills;
    for (const key of new Set([...Object.keys(oldBaseSkills), ...Object.keys(growth.base.skills)])) {
      const previous = oldBaseSkills[key] ?? 0;
      const next = growth.base.skills[key] ?? 0;
      if (next > previous && (next > 2 || (effectiveSkills[key] ?? 0) > 2)) throw new ErrorUtil('Standard Skill edits cannot increase a rank beyond +2. Enable house-rule overrides to improve further.', 400);
    }
  }
}

function validateWeaveBase(character: any) {
  const base = character.sheet.weaveGrowth.base as GrowthBase;
  for (const group of ['might', 'finesse', 'wit', 'resolve']) {
    for (const value of Object.values(base.aspects[group]) as number[]) {
      if (!Number.isSafeInteger(value) || (!character.sheet.houseRuleOverride && (value < -2 || value > 4))) throw new ErrorUtil('Base Aspects must be whole numbers from -2 through +4, unless house-rule overrides are enabled.', 400);
    }
  }
  if (!Number.isSafeInteger(base.threadCap) || base.threadCap < 0) throw new ErrorUtil('Base Thread capacity must be a nonnegative whole number.', 400);
  if (!Number.isSafeInteger(base.hpAdjustment)) throw new ErrorUtil('Base HP adjustment must be a whole number.', 400);
}

export function resetWeaveGrowth(character: any) {
  const growth = initializeWeaveGrowth(character);
  validateWeaveBase(character);
  growth.entries = [];
  character.sheet.weaveLevel = 0;
  character.sheet.advancementHistory = [];
  applyWeaveGrowth(character);
  validateAndApplyGrowthRules(character);
  character.markModified?.('sheet.weaveGrowth');
}

export function previewWeaveReset(character: any) {
  const preview = { sheet: sheetObject(character) };
  resetWeaveGrowth(preview);
  return growthSnapshot(preview.sheet);
}
