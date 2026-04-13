import { ItemDefinitionType } from '../../model/ItemDefinitionModel';
import { CsvExportDefinition } from './csvExport';

export const itemCsvExportDefinition: CsvExportDefinition<ItemDefinitionType> = {
  entityName: 'items',
  columns: [
    { header: 'key', serialize: (doc) => doc.key },
    { header: 'name', serialize: (doc) => doc.name },
    { header: 'category', serialize: (doc) => doc.category },
    { header: 'status', serialize: (doc) => doc.status },
    { header: 'settingKeys', serialize: (doc) => doc.settingKeys.join('|') },
    { header: 'imageUrl', serialize: (doc) => doc.imageUrl ?? '' },
    { header: 'tags', serialize: (doc) => doc.tags.join('|') },
    { header: 'equippable', serialize: (doc) => String(doc.equippable) },
    { header: 'slot', serialize: (doc) => doc.slot ?? '' },
    { header: 'stackable', serialize: (doc) => String(doc.stackable) },
    { header: 'protection', serialize: (doc) => String(doc.protection ?? 0) },
    { header: 'notes', serialize: (doc) => doc.notes ?? '' },
    { header: 'attackProfiles', serialize: (doc) => JSON.stringify(doc.attackProfiles) },
    { header: 'grantedAbilities', serialize: (doc) => JSON.stringify(doc.grantedAbilities) },
  ],
};
