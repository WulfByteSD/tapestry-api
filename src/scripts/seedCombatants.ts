import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import CombatantModel from '../modules/game/content/model/CombatantModel';
import { MONGO_URI } from '../config/db';

async function seedCombatants() {
  await CombatantModel.deleteMany({
    key: { $in: ['gloomling', 'captain-varrick', 'forest-bear'] },
    settingKeys: 'woven-realms',
  });

  await CombatantModel.insertMany([
    {
      settingKeys: ['woven-realms'],
      key: 'gloomling',
      name: 'Gloomling',
      category: 'unwoven',
      disposition: 'hostile',
      tier: 'I',
      origin: 'Shadow',
      role: 'Skirmisher',
      perks: ['Small', 'Pack Hunter'],
      statline: {
        hp: 8,
        defenseTN: 11,
        harm: 'Light (2)',
        armor: 0,
        move: 'Near',
        actions: 1,
        tags: ['small', 'unwoven', 'pack'],
      },
      attacks: [
        {
          name: 'Clawed Rush',
          harm: 'Light (2)',
          range: 'Near',
          notes: 'Deals +1 harm if another gloomling is adjacent to the target.',
        },
      ],
      abilities: [
        {
          name: 'Skitter Away',
          text: 'After attacking, the gloomling may shift to another nearby position if it is not engaged.',
        },
      ],
      loreCheck: {
        skill: 'Wit [Knowledge]',
        tn: 10,
        villagers: ['They travel in hungry little packs and fear bright fire.'],
        scholars: ['They are minor Unwoven scavengers drawn to fear and darkness.'],
      },
      backgroundBehavior: 'Gloomlings are nuisance predators that harry isolated travelers, livestock, and the weak edges of settlements.',
      whereFound: ['Everpine outskirts', 'Forest trails', 'Ruined watchposts'],
      tactics: ['Circle weak targets first.', 'Retreat if bright fire or overwhelming resistance appears.'],
      hooks: ['A pack has begun stalking the road between Everpine and Middletown.'],
      notes: {
        public: 'Small, hungry Unwoven scavenger.',
        gm: 'Good early nuisance foe.',
      },
      media: {
        portraitUrl: '',
        tokenUrl: '',
        bannerUrl: '',
      },
      sourceType: 'original',
      status: 'published',
    },
    {
      settingKeys: ['woven-realms'],
      key: 'captain-varrick',
      name: 'Captain Varrick',
      category: 'npc',
      disposition: 'neutral',
      tier: 'II',
      origin: 'Mortal',
      role: 'Defender',
      perks: ['Shield Discipline', 'Militia Commander'],
      statline: {
        hp: 18,
        defenseTN: 13,
        harm: 'Moderate (4)',
        armor: 2,
        move: 'Near',
        actions: 2,
        tags: ['human', 'militia', 'commander'],
      },
      attacks: [
        {
          name: 'Sword and Board',
          harm: 'Moderate (4)',
          range: 'Engaged',
          notes: 'On a strong hit, Varrick may shove the target back.',
        },
      ],
      abilities: [
        {
          name: 'Hold the Line',
          text: "Allied militia within Near range gain +1 Defense TN until Varrick's next turn.",
        },
      ],
      loreCheck: {
        skill: 'Wit [Knowledge]',
        tn: 8,
        villagers: ['Varrick keeps Everpine safe, even if he is stern about it.'],
        soldiers: ['He favors discipline over bravado and hates wasted lives.'],
      },
      backgroundBehavior: 'The militia captain of Everpine. More guardian than aggressor, but fully capable in a fight.',
      whereFound: ['Everpine', 'Town gate', 'Militia barracks'],
      tactics: ['Protect civilians first.', 'Focus on controlling the battlefield rather than chasing kills.'],
      hooks: ['If the party causes violence in Everpine, Varrick is the first real response.'],
      notes: {
        public: 'Militia captain of Everpine.',
        gm: 'Good non-evil combatant. Useful for law-and-order scenes.',
      },
      media: {
        portraitUrl: '',
        tokenUrl: '',
        bannerUrl: '',
      },
      sourceType: 'derived_from_lore',
      status: 'published',
    },
    {
      settingKeys: ['woven-realms'],
      key: 'forest-bear',
      name: 'Forest Bear',
      category: 'creature',
      disposition: 'hostile',
      tier: 'II',
      origin: 'Beast',
      role: 'Brute',
      perks: ['Large', 'Territorial'],
      statline: {
        hp: 22,
        defenseTN: 10,
        harm: 'Heavy (8)',
        armor: 1,
        move: 'Near',
        actions: 1,
        tags: ['beast', 'forest', 'large'],
      },
      attacks: [
        {
          name: 'Maul',
          harm: 'Heavy (8)',
          range: 'Engaged',
          notes: 'Target is knocked prone on a strong hit.',
        },
      ],
      abilities: [
        {
          name: 'Territorial Roar',
          text: 'Creatures within Near range must test Resolve or hesitate before closing in.',
        },
      ],
      loreCheck: {
        skill: 'Wit [Survival]',
        tn: 8,
        villagers: ['Do not get between it and its den.'],
      },
      backgroundBehavior: 'A dangerous but natural predator of the deep forest.',
      whereFound: ['Northwood', 'Forest caves', 'Berry thickets'],
      tactics: ['Charges the nearest threat to its den or cubs.'],
      hooks: ['A wounded bear has become unusually aggressive near the road.'],
      notes: {
        public: 'A territorial forest predator.',
        gm: 'Solid generic wilderness combatant.',
      },
      media: {
        portraitUrl: '',
        tokenUrl: '',
        bannerUrl: '',
      },
      sourceType: 'original',
      status: 'published',
    },
  ]);

  console.log('Combatants seeded.');
}

async function main() {
  const mongoUri = MONGO_URI;
  if (!mongoUri) {
    throw new Error('Missing MONGO_URI');
  }

  await mongoose.connect(mongoUri, {
    dbName: process.env.MONGO_DBNAME,
  });
  await seedCombatants();
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
