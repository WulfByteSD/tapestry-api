import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { buildMongoURI } from '../config/db'; 
import { SkillDefinitionModel } from '../modules/game/content/model/SkillDefinition';

dotenv.config();

const SHARED = 'shared';
const WOVEN_REALMS = 'woven-realms';
const NEON_CITY = 'neon-city';

const skills = [
  {
    key: 'persuasion',
    name: 'Persuasion',
    category: 'social',
    settingKeys: [SHARED],
    defaultAspect: 'presence',
    tags: ['social', 'influence', 'universal'],
    notes: 'Influence, negotiate, or sway others through reason and charm.',
  },
  {
    key: 'deception',
    name: 'Deception',
    category: 'social',
    settingKeys: [SHARED],
    defaultAspect: 'charm',
    tags: ['social', 'lies', 'universal'],
    notes: 'Lie convincingly, bluff, conceal intent, or sell a false story.',
  },
  {
    key: 'insight',
    name: 'Insight',
    category: 'social',
    settingKeys: [SHARED],
    defaultAspect: 'empathy',
    tags: ['social', 'perception', 'universal'],
    notes: 'Read emotions, motives, and conversational pressure points.',
  },
  {
    key: 'athletics',
    name: 'Athletics',
    category: 'survival',
    settingKeys: [SHARED],
    defaultAspect: 'strength',
    tags: ['movement', 'body', 'universal'],
    notes: 'Climb, leap, swim, push, haul, and endure physical strain.',
  },
  {
    key: 'stealth',
    name: 'Stealth',
    category: 'survival',
    settingKeys: [SHARED],
    defaultAspect: 'agility',
    tags: ['movement', 'hidden', 'universal'],
    notes: 'Move quietly, remain unseen, and avoid notice.',
  },
  {
    key: 'perception',
    name: 'Perception',
    category: 'knowledge',
    settingKeys: [SHARED],
    defaultAspect: 'instinct',
    tags: ['awareness', 'universal'],
    notes: 'Notice danger, detail, tracks, or subtle changes in a scene.',
  },
  {
    key: 'medicine',
    name: 'Medicine',
    category: 'knowledge',
    settingKeys: [SHARED],
    defaultAspect: 'knowledge',
    tags: ['healing', 'support', 'universal'],
    notes: 'Treat injuries, stabilize wounds, and diagnose ailments.',
  },
  {
    key: 'survival',
    name: 'Survival',
    category: 'survival',
    settingKeys: [SHARED],
    defaultAspect: 'instinct',
    tags: ['nature', 'tracking', 'universal'],
    notes: 'Track prey, find shelter, navigate, and endure hostile environments.',
  },
  {
    key: 'lore',
    name: 'Lore',
    category: 'knowledge',
    settingKeys: [WOVEN_REALMS],
    defaultAspect: 'knowledge',
    tags: ['history', 'setting', 'fantasy'],
    notes: 'Recall legends, cultures, kingdoms, lineages, and ancient truths.',
  },
  {
    key: 'occult',
    name: 'Occult',
    category: 'magic',
    settingKeys: [WOVEN_REALMS],
    defaultAspect: 'knowledge',
    tags: ['magic', 'ritual', 'fantasy'],
    notes: 'Understand eldritch symbols, rituals, and forbidden arcana.',
  },
  {
    key: 'spellcraft',
    name: 'Spellcraft',
    category: 'magic',
    settingKeys: [WOVEN_REALMS],
    defaultAspect: 'willpower',
    tags: ['magic', 'casting', 'fantasy'],
    notes: 'Shape, analyze, or manipulate structured magical effects.',
  },
  {
    key: 'animal-handling',
    name: 'Animal Handling',
    category: 'survival',
    settingKeys: [WOVEN_REALMS],
    defaultAspect: 'empathy',
    tags: ['beasts', 'fantasy'],
    notes: 'Calm, guide, train, or interpret animal behavior.',
  },
  {
    key: 'systems',
    name: 'Systems',
    category: 'technical',
    settingKeys: [NEON_CITY],
    defaultAspect: 'knowledge',
    tags: ['cyberpunk', 'tech', 'networks'],
    notes: 'Operate, diagnose, and exploit software and digital systems.',
  },
  {
    key: 'hacking',
    name: 'Hacking',
    category: 'technical',
    settingKeys: [NEON_CITY],
    defaultAspect: 'instinct',
    tags: ['cyberpunk', 'intrusion', 'tech'],
    notes: 'Bypass security, breach networks, and manipulate digital infrastructure.',
  },
  {
    key: 'engineering',
    name: 'Engineering',
    category: 'technical',
    settingKeys: [SHARED, NEON_CITY],
    defaultAspect: 'knowledge',
    tags: ['machines', 'repair', 'universal'],
    notes: 'Build, repair, modify, and understand mechanical systems.',
  },
  {
    key: 'firearms',
    name: 'Firearms',
    category: 'combat',
    settingKeys: [NEON_CITY],
    defaultAspect: 'agility',
    tags: ['combat', 'ranged', 'modern'],
    notes: 'Use guns effectively under pressure.',
  },
  {
    key: 'melee',
    name: 'Melee',
    category: 'combat',
    settingKeys: [SHARED],
    defaultAspect: 'strength',
    tags: ['combat', 'close-quarters', 'universal'],
    notes: 'Fight effectively in close quarters with weapons or improvised force.',
  },
  {
    key: 'arcana',
    name: 'Arcana',
    category: 'magic',
    settingKeys: [WOVEN_REALMS],
    defaultAspect: 'knowledge',
    tags: ['magic', 'study', 'fantasy'],
    notes: 'Interpret magical theory, schools, and structured energy systems.',
  },
];

async function main() {
  const uri = buildMongoURI();

  await mongoose.connect(uri, {
    dbName: process.env.MONGO_DBNAME,
  });

  console.info('Connected to MongoDB');

  for (const skill of skills) {
    await SkillDefinitionModel.updateOne({ key: skill.key }, { $set: skill }, { upsert: true });
  }

  console.info(`Seeded ${skills.length} skills`);
  await mongoose.disconnect();
  console.info('Disconnected');
}

main().catch(async (err) => {
  console.error('Skill seed failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
