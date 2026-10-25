import type { InferSchemaType } from 'mongoose';
import type RollLogModel from '../../characters/model/RollLog';

export type DiscordSavedRoll = Pick<InferSchemaType<typeof RollLogModel.schema>,
  'character' | 'expression' | 'total' | 'allRolls' | 'keptRolls' | 'breakdown' | 'context' | 'aspectUsed' | 'rollType' | 'attack' | 'rolledAt' | 'discordDelivery'> & { _id: { toString(): string } };

// Count UTF-16 units as Discord does; never cut a surrogate pair or escape pair.
export function discordText(value: unknown, limit: number): string {
  const source = String(value ?? '');
  let result = '';
  for (const point of source) {
    const safe = point === '@' ? '@\u200b' : point === '<' ? '‹' : point === '>' ? '›' : point === ':' ? ':\u200b' : /[\\*_`~|\[\]()#]/.test(point) ? `\\${point}` : point;
    if (result.length + safe.length > limit - 1) return result + '…';
    result += safe;
  }
  return result;
}

export function discordRollMessage(roll: DiscordSavedRoll) {
  const delivery = roll.discordDelivery;
  const author = delivery?.playerName || 'Player unavailable';
  const actor = roll.character ? delivery?.characterName || 'Character unavailable' : author;
  const fields: { name: string; value: string; inline?: boolean }[] = [];
  const add = (name: string, value: unknown, limit = 350, inline = false) => {
    if (value !== undefined && value !== null && String(value).length) fields.push({ name, value: discordText(value, limit), inline });
  };
  add('Roll type', (roll.rollType || 'custom').replace(/[_-]/g, ' '), 100, true);
  add('Total', roll.total, 100, true);
  add('Expression', roll.expression, 350);
  add('All dice', roll.allRolls.join(', '), 600);
  add('Kept dice', roll.keptRolls.join(', ') || 'None', 600);
  const remaining = [...roll.keptRolls];
  const dropped = roll.allRolls.filter((value) => { const index = remaining.indexOf(value); if (index === -1) return true; remaining.splice(index, 1); return false; });
  add('Dropped dice', dropped.join(', ') || 'None', 600);
  add('Breakdown', roll.breakdown, 700);
  add('Context', roll.context, 700);
  add('Aspect', roll.aspectUsed?.replace(/\./g, ' · '), 150);
  if (roll.attack) {
    add('Attack outcome', roll.attack.outcome.replace(/_/g, ' '), 100, true);
    add('Target number', roll.attack.targetNumber, 100, true);
    add('Margin', roll.attack.margin, 100, true);
    add('Target', roll.attack.targetLabel, 250);
    add('Weapon', roll.attack.weaponNameSnapshot || roll.attack.itemKey, 250);
    add('Attack', roll.attack.attackNameSnapshot || roll.attack.attackProfileKey, 250);
  }
  return {
    nonce: roll._id.toString(), enforce_nonce: true,
    allowed_mentions: { parse: [], replied_user: false },
    embeds: [{
      title: discordText(delivery?.campaignName || 'Campaign roll', 220),
      description: `${discordText(actor, 180)}${roll.character ? `\nRolled by ${discordText(author, 180)}` : ''}`,
      color: 0xc9a75e,
      fields,
      footer: { text: `Tapestry · Roll ${roll._id.toString()}` },
      timestamp: new Date(roll.rolledAt).toISOString(),
    }],
  };
}
