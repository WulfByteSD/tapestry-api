import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import db from '../config/db';
import SettingModel from '../modules/game/content/model/SettingModel';
import ItemDefinitionModel from '../modules/game/content/model/ItemDefinitionModel';

const wovenRealmsSetting = {
  key: 'woven-realms',
  name: 'The Woven Realms',
  description: 'High-fantasy flagship setting for Tapestry. Seeded test data for inventory, combat, and content-library development.',
  status: 'published' as const,
  tags: ['fantasy', 'flagship', 'seeded'],
  rulesetVersion: 1,
  modules: {
    items: true,
    lore: true,
    maps: false,
    magic: false,
  },
};

const wovenRealmsItems = [
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:shortsword',
    name: 'Shortsword',
    category: 'weapon',
    status: 'published',
    tags: ['martial', 'melee', 'one-handed', 'steel'],
    equippable: true,
    slot: 'main_hand',
    stackable: false,
    notes: 'A dependable sidearm carried by scouts, militia, and sellswords.',
    attackProfiles: [
      {
        key: 'standard-strike',
        name: 'Standard Strike',
        attackKind: 'melee',
        defaultAspect: 'might.strength',
        allowedSkillKeys: ['melee'],
        modifier: 1,
        harm: 2,
        rangeLabel: 'Engaged',
        tags: ['weapon-attack'],
        notes: 'Clean, balanced, and reliable.',
      },
    ],
  },
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:longsword',
    name: 'Longsword',
    category: 'weapon',
    status: 'published',
    tags: ['martial', 'melee', 'versatile', 'steel'],
    equippable: true,
    slot: 'main_hand',
    stackable: false,
    notes: 'Favored by knights, sworn blades, and disciplined duelists.',
    attackProfiles: [
      {
        key: 'cleaving-cut',
        name: 'Cleaving Cut',
        attackKind: 'melee',
        defaultAspect: 'might.strength',
        allowedSkillKeys: ['melee'],
        modifier: 1,
        harm: 3,
        rangeLabel: 'Engaged',
        tags: ['weapon-attack'],
      },
      {
        key: 'guard-thrust',
        name: 'Guard Thrust',
        attackKind: 'melee',
        defaultAspect: 'finesse.agility',
        allowedSkillKeys: ['melee'],
        modifier: 0,
        harm: 2,
        rangeLabel: 'Engaged',
        tags: ['weapon-attack', 'precise'],
      },
    ],
  },
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:dagger',
    name: 'Dagger',
    category: 'weapon',
    status: 'published',
    tags: ['light', 'melee', 'thrown', 'concealable'],
    equippable: true,
    slot: 'main_hand',
    stackable: false,
    notes: 'Small, fast, and useful when everything has gone sideways.',
    attackProfiles: [
      {
        key: 'close-stab',
        name: 'Close Stab',
        attackKind: 'melee',
        defaultAspect: 'finesse.agility',
        allowedSkillKeys: ['melee'],
        modifier: 1,
        harm: 1,
        rangeLabel: 'Engaged',
        tags: ['weapon-attack', 'light'],
      },
      {
        key: 'quick-throw',
        name: 'Quick Throw',
        attackKind: 'ranged',
        defaultAspect: 'finesse.agility',
        allowedSkillKeys: ['ranged'],
        modifier: 0,
        harm: 1,
        rangeLabel: 'Near',
        tags: ['weapon-attack', 'thrown'],
      },
    ],
  },
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:spear',
    name: 'Spear',
    category: 'weapon',
    status: 'published',
    tags: ['melee', 'reach', 'martial'],
    equippable: true,
    slot: 'main_hand',
    stackable: false,
    notes: 'A battlefield classic. Cheap, deadly, and blessedly honest.',
    attackProfiles: [
      {
        key: 'driving-thrust',
        name: 'Driving Thrust',
        attackKind: 'melee',
        defaultAspect: 'might.strength',
        allowedSkillKeys: ['melee'],
        modifier: 1,
        harm: 2,
        rangeLabel: 'Reach',
        tags: ['weapon-attack', 'reach'],
      },
      {
        key: 'set-brace',
        name: 'Set Brace',
        attackKind: 'special',
        defaultAspect: 'resolve.willpower',
        allowedSkillKeys: ['melee'],
        modifier: 0,
        harm: 3,
        rangeLabel: 'Reach',
        tags: ['weapon-attack', 'reactive'],
        notes: 'Useful when holding a line or receiving a charge.',
      },
    ],
  },
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:warhammer',
    name: 'Warhammer',
    category: 'weapon',
    status: 'published',
    tags: ['martial', 'melee', 'heavy', 'blunt'],
    equippable: true,
    slot: 'main_hand',
    stackable: false,
    notes: 'Less elegant than a blade, more convincing against armor.',
    attackProfiles: [
      {
        key: 'crushing-blow',
        name: 'Crushing Blow',
        attackKind: 'melee',
        defaultAspect: 'might.strength',
        allowedSkillKeys: ['melee'],
        modifier: 0,
        harm: 3,
        rangeLabel: 'Engaged',
        tags: ['weapon-attack', 'heavy'],
      },
    ],
  },
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:longbow',
    name: 'Longbow',
    category: 'weapon',
    status: 'published',
    tags: ['ranged', 'bow', 'two-handed'],
    equippable: true,
    slot: 'two_hands',
    stackable: false,
    notes: 'Favored by hunters, rangers, and anyone who prefers distance over speeches.',
    attackProfiles: [
      {
        key: 'loose-arrow',
        name: 'Loose Arrow',
        attackKind: 'ranged',
        defaultAspect: 'finesse.agility',
        allowedSkillKeys: ['ranged'],
        modifier: 1,
        harm: 2,
        rangeLabel: 'Far',
        tags: ['weapon-attack'],
      },
    ],
  },
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:light-crossbow',
    name: 'Light Crossbow',
    category: 'weapon',
    status: 'published',
    tags: ['ranged', 'crossbow', 'mechanical'],
    equippable: true,
    slot: 'two_hands',
    stackable: false,
    notes: 'Heavier than a bow, easier to train with, slower to reload.',
    attackProfiles: [
      {
        key: 'fire-bolt',
        name: 'Fire Bolt',
        attackKind: 'ranged',
        defaultAspect: 'wit.instinct',
        allowedSkillKeys: ['ranged'],
        modifier: 0,
        harm: 3,
        rangeLabel: 'Far',
        tags: ['weapon-attack'],
      },
    ],
  },
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:round-shield',
    name: 'Round Shield',
    protection: 1,
    category: 'armor',
    status: 'published',
    tags: ['shield', 'defense', 'off-hand'],
    equippable: true,
    slot: 'off_hand',
    stackable: false,
    notes: 'Wood and iron made into a very reasonable argument against dying.',
    attackProfiles: [],
  },
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:leather-cuirass',
    name: 'Leather Cuirass',
    protection: 1,
    category: 'armor',
    status: 'published',
    tags: ['armor', 'light', 'body'],
    equippable: true,
    slot: 'body',
    stackable: false,
    notes: 'Light protection that won’t turn every sprint into a moral crisis.',
    attackProfiles: [],
  },
  {
    settingKey: 'woven-realms',
    key: 'woven-realms:healing-draught',
    name: 'Healing Draught',
    category: 'consumable',
    status: 'published',
    tags: ['potion', 'healing', 'consumable'],
    equippable: false,
    slot: null,
    stackable: true,
    notes: 'A common restorative carried by adventurers with decent instincts.',
    attackProfiles: [],
  },
];

async function seedGameContent() {
  console.info('🌱 Seeding game content...');
  await db();

  await SettingModel.updateOne({ key: wovenRealmsSetting.key }, { $set: wovenRealmsSetting }, { upsert: true });

  for (const item of wovenRealmsItems) {
    await ItemDefinitionModel.updateOne({ key: item.key }, { $set: item }, { upsert: true });
  }

  const itemCount = await ItemDefinitionModel.countDocuments({
    settingKey: wovenRealmsSetting.key,
  });

  console.info(`✅ Seeded setting: ${wovenRealmsSetting.key}`);
  console.info(`✅ Total items for ${wovenRealmsSetting.key}: ${itemCount}`);
}

seedGameContent()
  .catch((error) => {
    console.error('❌ Failed to seed game content:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.info('🔌 MongoDB disconnected');
  });
