import Combatant from '../model/CombatantModel';

/** Catalog vocabulary only; no canonical Origin enum or record rewrites. */
export default class CombatantOriginsHandler {
  async list(): Promise<string[]> {
    const values = new Map<string, string>();
    const cursor = Combatant.find({}, { origin: 1, origins: 1, _id: 0 }).sort({ _id: 1 }).lean().cursor();
    for await (const record of cursor) {
      const tags = record.origins?.join(' / ') === record.origin ? record.origins : record.origin ? [record.origin] : record.origins ?? [];
      for (const tag of tags ?? []) { const value = tag.trim(); if (value && !values.has(value.toLowerCase())) values.set(value.toLowerCase(), value); }
    }
    return [...values.values()].sort((a, b) => a.localeCompare(b));
  }
}
