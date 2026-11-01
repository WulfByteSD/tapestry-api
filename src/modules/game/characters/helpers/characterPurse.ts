import { ErrorUtil } from '../../../../middleware/ErrorUtil';
import { patchPaths } from './characterGrowth';

export interface PurseSnapshot {
  baseCapacity: number;
  weaveBonus: number;
  capacity: number;
  marks: number;
  available: number;
  tappedOut: boolean;
  excess: number;
}

/** Legacy characters are initialized in memory; reading does not create history. */
export function purseSnapshot(character: any): PurseSnapshot {
  const baseCapacity = character.sheet.purse?.baseCapacity ?? 3;
  const marks = character.sheet.purse?.marks ?? 0;
  const weave = character.sheet.weaveLevel ?? 0;
  if (![baseCapacity, marks, weave].every(value => Number.isSafeInteger(value) && value >= 0)) throw new ErrorUtil('Purse values and Weave must be nonnegative safe whole numbers.', 400);
  const weaveBonus = Math.floor(weave / 2);
  if (baseCapacity > Number.MAX_SAFE_INTEGER - weaveBonus) throw new ErrorUtil('Purse capacity must remain a safe whole number.', 400);
  const capacity = baseCapacity + weaveBonus;
  character.sheet.purse ??= { baseCapacity, marks };
  character.sheet.purse.baseCapacity ??= baseCapacity;
  character.sheet.purse.marks ??= marks;
  return { baseCapacity, weaveBonus, capacity, marks, available: Math.max(0, capacity - marks), tappedOut: marks >= capacity, excess: Math.max(0, marks - capacity) };
}

/** Full-sheet clients may echo unchanged values; all actual edits are audited. */
export function assertPursePatchUnchanged(character: any, data: any) {
  for (const path of patchPaths(data).filter(path => /^sheet\.purse(\.|$)/.test(path))) {
    const read = (value: any) => {
      const prefix = Object.keys(value).filter(key => path === key || path.startsWith(`${key}.`)).sort((a, b) => b.length - a.length)[0];
      if (!prefix) return undefined;
      return path.slice(prefix.length).split('.').filter(Boolean).reduce((item, key) => item?.[key], value[prefix]);
    };
    const current = read(character.toObject ? character.toObject({ flattenMaps: true }) : character);
    const proposed = read(data);
    const stable = (value: any) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item).sort().reduce((result: any, key) => { result[key] = item[key]; return result; }, {}) : item);
    if (stable(current) !== stable(proposed)) throw new ErrorUtil('Use the Purse controls to change marks or base capacity so the change is recorded.', 400);
  }
}
