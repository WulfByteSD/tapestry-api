import mongoose from 'mongoose';
import { discordRollMessage, discordText } from '../discordRollMessage';
import { discordBotRequest } from '../discordBotClient';
import RollLogModel from '../../../characters/model/RollLog';

describe('Discord roll payload and HTTP safety', () => {
  const originalToken = process.env.DISCORD_BOT_TOKEN;
  beforeEach(() => { process.env.DISCORD_BOT_TOKEN = 'isolated-test-token'; });
  afterEach(() => { jest.restoreAllMocks(); if (originalToken === undefined) delete process.env.DISCORD_BOT_TOKEN; else process.env.DISCORD_BOT_TOKEN = originalToken; });

  it('bounds every field and the full embed, preserves Unicode, and suppresses pings/links', () => {
    const text = '@everyone <@123456789012345678> **[click](https://example.com)** 😀'.repeat(300);
    const roll = new RollLogModel({ player: new mongoose.Types.ObjectId(), character: new mongoose.Types.ObjectId(), expression: text, total: 0, allRolls: Array(100).fill(1000), keptRolls: Array(50).fill(1000), breakdown: text, context: text, aspectUsed: text, rollType: text, rolledAt: new Date(), attack: { targetNumber: 20, margin: -20, outcome: 'miss', targetLabel: text, weaponNameSnapshot: text, attackNameSnapshot: text }, discordDelivery: { state: 'pending', createdAt: new Date(), campaignName: text, playerName: text, characterName: text } });
    const message = discordRollMessage(roll.toObject());
    const embed = message.embeds[0];
    expect(message).toMatchObject({ nonce: roll._id.toString(), enforce_nonce: true, allowed_mentions: { parse: [], replied_user: false } });
    expect(embed.title.length).toBeLessThanOrEqual(256);
    expect(embed.description.length).toBeLessThanOrEqual(4096);
    expect(embed.fields.length).toBeLessThanOrEqual(25);
    for (const field of embed.fields) { expect(field.name.length).toBeLessThanOrEqual(256); expect(field.value.length).toBeLessThanOrEqual(1024); }
    const allText = embed.title + embed.description + embed.footer.text + embed.fields.map((field) => field.name + field.value).join('');
    expect(allText.length).toBeLessThanOrEqual(6000);
    expect(allText).not.toContain('@everyone');
    expect(allText).not.toContain('<@');
    expect(allText).not.toContain('https://');
    expect(embed.fields.find((field) => field.name === 'Total')?.value).toBe('0');
    expect(embed.fields.find((field) => field.name === 'Dropped dice')?.value.split(', ')).toHaveLength(50);
    for (const limit of [2, 3, 4, 5, 20]) { const value = discordText('😀😀😀', limit); expect(value.length).toBeLessThanOrEqual(limit); expect(value).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/); }
  });

  it.each(['Infinity', 'NaN', 'not-a-number'])('handles malformed Retry-After %s without invalid dates', async (header) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ retry_after: header }), { status: 429, headers: { 'Retry-After': header } }));
    await expect(discordBotRequest('/channels/123')).rejects.toMatchObject({ kind: 'rate_limit', retryAfterMs: 1250 });
  });

  it('honors the longest finite Discord retry delay', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ retry_after: 1.5 }), { status: 429, headers: { 'Retry-After': '4', 'X-RateLimit-Reset-After': '3' } }));
    await expect(discordBotRequest('/channels/123')).rejects.toMatchObject({ kind: 'rate_limit', retryAfterMs: 4250 });
  });

  it('fails closed without a token and never calls HTTP', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const request = jest.spyOn(globalThis, 'fetch');
    await expect(discordBotRequest('/channels/123')).rejects.toMatchObject({ kind: 'permanent' });
    expect(request).not.toHaveBeenCalled();
  });
});
