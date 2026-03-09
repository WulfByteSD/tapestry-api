import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { buildMongoURI } from '../config/db';
import AbilityDefinitionModel from '../modules/game/content/model/AbilityDefinitionModel';

dotenv.config();

const WOVEN_REALMS = 'woven-realms';
const SHARED = 'shared';

const abilities = [
  {
    key: 'fireball',
    name: 'Fireball',
    status: 'published',
    settingKeys: [WOVEN_REALMS],
    category: 'spell',
    sourceType: 'learned',
    activation: 'action',
    usageModel: 'resource-cost',
    cost: { resourceKey: 'mana', amount: 2 },
    defaultAspect: 'knowledge',
    allowedSkillKeys: ['spellcraft', 'arcana'],
    tags: ['fire', 'aoe', 'magic'],
    summary: 'Launch a roaring sphere of flame that bursts on impact.',
    effectText: 'Make a ranged magical attack. On a hit, deal fire harm in a small area.',
  },
  {
    key: 'flame-charge',
    name: 'Flame Charge',
    status: 'published',
    settingKeys: [WOVEN_REALMS],
    category: 'feature',
    sourceType: 'item-granted',
    activation: 'action',
    usageModel: 'per-scene',
    tags: ['fire', 'weapon', 'buff'],
    summary: 'Your weapon ignites for the rest of the scene.',
    effectText: 'Your weapon becomes sheathed in flame and deals additional fire harm this scene.',
  },
  {
    key: 'warding-seal',
    name: 'Warding Seal',
    status: 'published',
    settingKeys: [WOVEN_REALMS],
    category: 'spell',
    sourceType: 'learned',
    activation: 'reaction',
    usageModel: 'resource-cost',
    cost: { resourceKey: 'mana', amount: 1 },
    defaultAspect: 'willpower',
    allowedSkillKeys: ['spellcraft'],
    tags: ['defense', 'magic'],
    summary: 'Raise a brief magical ward against incoming harm.',
    effectText: 'Reduce incoming harm or gain brief protection against a strike.',
  },
  {
    key: 'ember-step',
    name: 'Ember Step',
    status: 'published',
    settingKeys: [WOVEN_REALMS],
    category: 'spell',
    sourceType: 'learned',
    activation: 'bonus',
    usageModel: 'per-scene',
    defaultAspect: 'agility',
    allowedSkillKeys: ['spellcraft'],
    tags: ['movement', 'fire', 'magic'],
    summary: 'Move in a burst of cinders and heat.',
    effectText: 'Reposition quickly, leaving flickering embers in your wake.',
  },
  {
    key: 'battle-trance',
    name: 'Battle Trance',
    status: 'published',
    settingKeys: [SHARED],
    category: 'technique',
    sourceType: 'learned',
    activation: 'bonus',
    usageModel: 'per-scene',
    tags: ['martial', 'focus'],
    summary: 'Center yourself for decisive action.',
    effectText: 'Gain a temporary edge in close combat or on your next decisive maneuver.',
  },
];

async function main() {
  const uri = buildMongoURI();

  await mongoose.connect(uri, {
    dbName: process.env.MONGO_DBNAME,
  });

  console.info('Connected to MongoDB');

  for (const ability of abilities) {
    await AbilityDefinitionModel.updateOne({ key: ability.key }, { $set: ability }, { upsert: true });
  }

  console.info(`Seeded ${abilities.length} abilities`);
  await mongoose.disconnect();
  console.info('Disconnected');
}

main().catch(async (err) => {
  console.error('Ability seed failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
