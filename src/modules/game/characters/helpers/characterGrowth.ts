import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { applyCharacterRules } from '../../rules';

/** Preserve legacy maxima before applying any changes to Strength. */
export function initializeHPAdjustment(character: any) {
  const sheet = character.sheet;
  sheet.baseHP ??= 12;
  if (sheet.hpAdjustment == null) {
    const max = sheet.resources?.hp?.max;
    sheet.hpAdjustment = Number.isSafeInteger(max) && max > 0 ? max - sheet.baseHP - (sheet.aspects?.might?.strength ?? 0) : 0;
  }
}

export function validateAndApplyGrowthRules(character: any) {
  const sheet = character.sheet;
  if (!Number.isSafeInteger(sheet.baseHP ?? 12) || (sheet.baseHP ?? 12) < 0) throw new ErrorUtil('Base HP must be a nonnegative whole number.', 400);
  if (!Number.isSafeInteger(sheet.weaveLevel) || sheet.weaveLevel < 0) throw new ErrorUtil('Weave must be a nonnegative whole number.', 400);
  const skills = sheet.skills instanceof Map ? Object.fromEntries(sheet.skills) : sheet.skills ?? {};
  if (Object.values(skills).some((rank: any) => !Number.isSafeInteger(rank) || rank < 0)) throw new ErrorUtil('Skills must use nonnegative safe whole numbers.', 400);
  validateResourceTracks(sheet);
  const data = { baseHP: sheet.baseHP, threadCapacity: sheet.resources.threads.max, aspects: sheet.aspects, hp: sheet.resources.hp, threads: sheet.resources.threads, dtn: sheet.dtn, hpAdjustment: sheet.hpAdjustment, houseRuleOverride: sheet.houseRuleOverride };
  try { applyCharacterRules(data); }
  catch (error) { throw new ErrorUtil(error instanceof Error ? error.message : 'Invalid character growth.', 400); }
  if (!Number.isSafeInteger(data.dtn)) throw new ErrorUtil('Defense TN must remain a finite safe whole number.', 400);
  sheet.resources.hp = data.hp;
  sheet.resources.threads = data.threads;
  sheet.dtn = data.dtn;
}

/** Validate persisted resource inputs before applying capacity clamps. */
export function validateResourceTracks(sheet: any) {
  for (const [name, track] of Object.entries(sheet.resources ?? {}) as [string, any][]) {
    if (!['hp', 'threads'].includes(name)) continue;
    for (const key of ['current', 'max', 'temp']) {
      if ((key !== 'temp' || track[key] !== undefined) && (!Number.isSafeInteger(track[key]) || track[key] < 0)) throw new ErrorUtil('Health and Threads must be nonnegative whole numbers.', 400);
    }
  }
}

/** Dot notation and nested patch objects must obey the same validation. */
export function patchPaths(data: any, prefix = ''): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [prefix];
  return Object.entries(data).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...patchPaths(value, path)];
  });
}

export function explicitHPMax(data: any): unknown {
  return data['sheet.resources.hp.max'] ?? data['sheet.resources.hp']?.max ?? data['sheet.resources']?.hp?.max ?? data.sheet?.resources?.hp?.max;
}
