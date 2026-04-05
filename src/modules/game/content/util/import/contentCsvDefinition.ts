import { ErrorUtil } from '../../../../../middleware/ErrorUtil';
import AbilityDefinitionModel from '../../model/AbilityDefinitionModel';
import ItemDefinitionModel from '../../model/ItemDefinitionModel';
import SettingModel from '../../model/SettingModel';
import { SkillDefinitionModel } from '../../model/SkillDefinition';
import { CsvImportDefinition, CsvRow, assertEnum, normalizeKey, optionalString, parseBoolean, parseJsonCell, parseNumber, requireString, splitList } from './csvImport';

const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const;
const ITEM_CATEGORIES = ['weapon', 'armor', 'gear', 'consumable', 'tool', 'currency', 'quest', 'other'] as const;
const SKILL_CATEGORIES = ['social', 'combat', 'technical', 'knowledge', 'survival', 'magic', 'other'] as const;
const ABILITY_CATEGORIES = ['spell', 'technique', 'augment', 'program', 'prayer', 'mutation', 'feature', 'other'] as const;
const ABILITY_SOURCE_TYPES = ['learned', 'item-granted', 'implant-granted', 'feature-granted', 'innate'] as const;
const ABILITY_ACTIVATIONS = ['action', 'bonus', 'reaction', 'passive', 'downtime', 'special'] as const;
const ABILITY_USAGE_MODELS = ['at-will', 'resource-cost', 'per-scene', 'per-rest', 'cooldown', 'charges'] as const;

type SettingKeyContext = {
  validSettingKeys: Set<string>;
};

type ItemEntity = { key: string; [key: string]: any };
type SkillEntity = { key: string; [key: string]: any };
type AbilityEntity = { key: string; [key: string]: any };
type SettingEntity = { key: string; [key: string]: any };

async function buildSettingKeyContext(rows: CsvRow[]): Promise<SettingKeyContext> {
  const requested = [
    ...new Set(
      rows
        .flatMap((row) => splitList(row.settingKeys))
        .map((key) => normalizeKey(key))
        .filter(Boolean)
    ),
  ];

  const requestedNonShared = requested.filter((key) => key !== 'shared');

  const existing =
    requestedNonShared.length > 0
      ? await SettingModel.find({
          key: { $in: requestedNonShared },
          status: { $ne: 'archived' },
        })
          .select('key -_id')
          .lean()
      : [];

  return {
    validSettingKeys: new Set(['shared', ...existing.map((doc: any) => normalizeKey(doc.key))]),
  };
}

function parseSettingKeys(row: CsvRow, rowNumber: number, context: SettingKeyContext): string[] {
  const settingKeys = splitList(row.settingKeys).map((key) => normalizeKey(key));

  if (settingKeys.length === 0) {
    throw new ErrorUtil(`settingKeys is required (row ${rowNumber})`, 400);
  }

  const unknown = settingKeys.filter((key) => !context.validSettingKeys.has(key));
  if (unknown.length > 0) {
    throw new ErrorUtil(`Unknown setting key(s): ${unknown.join(', ')} (row ${rowNumber})`, 400);
  }

  return settingKeys;
}

function ensureArray(value: unknown, field: string, rowNumber: number): any[] {
  if (!Array.isArray(value)) {
    throw new ErrorUtil(`${field} must be a JSON array (row ${rowNumber})`, 400);
  }
  return value;
}

function ensureObjectOrNull(value: unknown, field: string, rowNumber: number): Record<string, unknown> | null {
  if (value === null) return null;
  if (Array.isArray(value) || typeof value !== 'object') {
    throw new ErrorUtil(`${field} must be a JSON object (row ${rowNumber})`, 400);
  }
  return value as Record<string, unknown>;
}

export const itemCsvImportDefinition: CsvImportDefinition<ItemEntity, SettingKeyContext> = {
  entityName: 'items',
  model: ItemDefinitionModel,
  requiredHeaders: ['key', 'name', 'category', 'settingKeys'],
  prepareContext: buildSettingKeyContext,
  parseRow: async (row, rowNumber, context) => {
    const key = normalizeKey(requireString(row, 'key', rowNumber));
    const name = requireString(row, 'name', rowNumber);
    const category = assertEnum(normalizeKey(requireString(row, 'category', rowNumber)), 'category', ITEM_CATEGORIES);
    const status = assertEnum(normalizeKey(row.status || 'published'), 'status', CONTENT_STATUSES);

    const settingKeys = parseSettingKeys(row, rowNumber, context);
    const attackProfiles = ensureArray(parseJsonCell<any[]>(row.attackProfiles, []), 'attackProfiles', rowNumber);
    const grantedAbilities = ensureArray(parseJsonCell<any[]>(row.grantedAbilities, []), 'grantedAbilities', rowNumber);

    return {
      key,
      name,
      category,
      status,
      settingKeys,
      tags: splitList(row.tags),
      equippable: parseBoolean(row.equippable, false),
      slot: optionalString(row, 'slot'),
      stackable: parseBoolean(row.stackable, false),
      protection: parseNumber(row.protection, 0) ?? 0,
      notes: String(row.notes ?? '').trim(),
      attackProfiles,
      grantedAbilities,
    };
  },
};

export const skillCsvImportDefinition: CsvImportDefinition<SkillEntity, SettingKeyContext> = {
  entityName: 'skills',
  model: SkillDefinitionModel,
  requiredHeaders: ['key', 'name', 'settingKeys'],
  prepareContext: buildSettingKeyContext,
  parseRow: async (row, rowNumber, context) => {
    const key = normalizeKey(requireString(row, 'key', rowNumber));
    const name = requireString(row, 'name', rowNumber);
    const status = assertEnum(normalizeKey(row.status || 'published'), 'status', CONTENT_STATUSES);
    const category = assertEnum(normalizeKey(row.category || 'other'), 'category', SKILL_CATEGORIES);

    return {
      key,
      name,
      status,
      settingKeys: parseSettingKeys(row, rowNumber, context),
      category,
      defaultAspect: optionalString(row, 'defaultAspect'),
      tags: splitList(row.tags),
      notes: String(row.notes ?? '').trim(),
    };
  },
};

export const abilityCsvImportDefinition: CsvImportDefinition<AbilityEntity, SettingKeyContext> = {
  entityName: 'abilities',
  model: AbilityDefinitionModel,
  requiredHeaders: ['key', 'name', 'settingKeys'],
  prepareContext: buildSettingKeyContext,
  parseRow: async (row, rowNumber, context) => {
    const key = normalizeKey(requireString(row, 'key', rowNumber));
    const name = requireString(row, 'name', rowNumber);
    const status = assertEnum(normalizeKey(row.status || 'published'), 'status', CONTENT_STATUSES);

    const category = assertEnum(normalizeKey(row.category || 'other'), 'category', ABILITY_CATEGORIES);

    const sourceType = assertEnum(normalizeKey(row.sourceType || 'learned'), 'sourceType', ABILITY_SOURCE_TYPES);

    const activation = assertEnum(normalizeKey(row.activation || 'action'), 'activation', ABILITY_ACTIVATIONS);

    const usageModel = assertEnum(normalizeKey(row.usageModel || 'at-will'), 'usageModel', ABILITY_USAGE_MODELS);

    const cost = ensureObjectOrNull(parseJsonCell<Record<string, unknown> | null>(row.cost, null), 'cost', rowNumber);

    return {
      key,
      name,
      status,
      settingKeys: parseSettingKeys(row, rowNumber, context),
      category,
      sourceType,
      activation,
      usageModel,
      cost,
      defaultAspect: optionalString(row, 'defaultAspect'),
      allowedSkillKeys: splitList(row.allowedSkillKeys),
      tags: splitList(row.tags),
      summary: String(row.summary ?? '').trim(),
      effectText: String(row.effectText ?? '').trim(),
    };
  },
};

export const settingCsvImportDefinition: CsvImportDefinition<SettingEntity, undefined> = {
  entityName: 'settings',
  model: SettingModel,
  requiredHeaders: ['key', 'name'],
  parseRow: async (row, rowNumber) => {
    const key = normalizeKey(requireString(row, 'key', rowNumber));
    const name = requireString(row, 'name', rowNumber);
    const status = assertEnum(normalizeKey(row.status || 'published'), 'status', CONTENT_STATUSES);

    const modules = ensureObjectOrNull(
      parseJsonCell<Record<string, unknown> | null>(row.modules, {
        items: true,
        lore: false,
        maps: false,
        magic: false,
      }),
      'modules',
      rowNumber
    ) || {
      items: true,
      lore: false,
      maps: false,
      magic: false,
    };

    return {
      key,
      name,
      description: String(row.description ?? '').trim(),
      status,
      tags: splitList(row.tags),
      rulesetVersion: parseNumber(row.rulesetVersion, 1) ?? 1,
      modules,
    };
  },
};
