import slugify from "slugify";
import { ItemCreateInput } from "../handlers/ItemDefinition.handler";
import { ItemScope } from "../model/ItemDefinitionModel";
import { ErrorUtil } from "../../../../middleware/ErrorUtil";

export default (data: ItemCreateInput): Required<ItemCreateInput> => {
  const name = String(data.name || '').trim();
  const scope = (data.scope || 'setting') as ItemScope;
  const settingKeys = uniqueStrings(data.settingKeys);

  if (!name) {
    throw new ErrorUtil('Item name is required', 400);
  }

  if (!['shared', 'setting'].includes(scope)) {
    throw new ErrorUtil('Item scope must be shared or setting', 400);
  }

  if (settingKeys.length === 0) {
    throw new ErrorUtil('At least one setting key is required', 400);
  }

  if (scope === 'setting' && settingKeys.length !== 1) {
    throw new ErrorUtil('Setting-scoped items must belong to exactly one setting', 400);
  }

  const normalizedKey =
    String(data.key || '').trim() ||
    buildItemKey({
      name,
      scope,
      settingKeys,
    });

  return {
    ...data,
    key: normalizedKey,
    name,
    scope,
    settingKeys,
    category: String(data.category || '').trim(),
    status: String(data.status || 'published').trim(),
    tags: Array.isArray(data.tags) ? data.tags : [],
    equippable: Boolean(data.equippable),
    slot: data.slot ?? null,
    stackable: Boolean(data.stackable),
    notes: String(data.notes || ''),
    attackProfiles: Array.isArray(data.attackProfiles) ? data.attackProfiles : [],
    protection: typeof data.protection === 'number' && Number.isFinite(data.protection) ? data.protection : 0,
  };
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
}

function buildItemKey(input: { name: string; scope: ItemScope; settingKeys: string[] }): string {
  const nameSlug = slugify(input.name, { lower: true, strict: true }).trim();

  if (!nameSlug) {
    throw new ErrorUtil('Item name is required to generate a key', 400);
  }

  if (input.scope === 'shared') {
    return nameSlug;
  }

  const primarySetting = input.settingKeys[0];
  if (!primarySetting) {
    throw new ErrorUtil('Setting-scoped items require at least one setting key', 400);
  }

  return `${primarySetting}:${nameSlug}`;
}
