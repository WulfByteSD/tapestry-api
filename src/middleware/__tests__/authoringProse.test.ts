import type { Request, Response } from 'express';
import { characterNoteHtml } from '../characterNoteHtml';
const rich = '<!--tapestry:richtext:v1--><p><strong>Clue</strong></p>';
function clean(path: string, method: string, body: any) {
  const req = { path, method, body, query: { search: '<script>unsafe</script>' }, params: {} } as unknown as Request;
  let completed = false;
  characterNoteHtml(req, {} as Response, error => { if (error) throw error; completed = true; });
  expect(completed).toBe(true); expect(req.query.search).not.toContain('<script>'); return req.body;
}
describe('authoring prose sanitizer boundary', () => {
  it.each(['POST', 'PUT'])('preserves only lore article prose on %s', method => {
    const path = '/api/v1/game/content/lore' + (method === 'PUT' ? '/111111111111111111111111' : '');
    const body = clean(path, method, {
      name: '<img src=x>', summary: 'Plain < literal\nSecond line', body: rich,
      meta: { world: { timelineNote: rich, era: '<img src=x>' }, identity: { subtitle: rich } },
      unrelated: rich,
    });
    expect(body.summary).toBe('Plain < literal\nSecond line');
    expect(body.body).toBe(rich);
    expect(body.meta.world.timelineNote).toBe(rich);
    expect(body.name).not.toContain('<img');
    expect(body.meta.world.era).not.toContain('<img');
    expect(body.meta.identity.subtitle).not.toBe(rich);
    expect(body.unrelated).not.toBe(rich);
  });
  it.each([
    ['/api/v1/game/content/lore', 'PATCH'],
    ['/api/v1/game/content/lore/not-an-id', 'PUT'],
    ['/api/v1/game/content/items', 'POST'],
  ])('does not exempt lore-like fields on %s %s', (path, method) => {
    expect(clean(path, method, { summary: rich, body: rich }).body).not.toBe(rich);
  });
  it('retains cleared lore prose without introducing default values', () => {
    const body = clean('/api/v1/game/content/lore/111111111111111111111111', 'PUT', {
      summary: '', body: '', meta: { world: { timelineNote: '' } },
    });
    expect(body).toEqual({ summary: '', body: '', meta: { world: { timelineNote: '' } } });
  });
  it.each(['POST', 'PUT'])('preserves only known combatant prose on %s', method => {
    const path = '/api/v1/game/content/combatants' + (method === 'PUT' ? '/111111111111111111111111' : '');
    const body = clean(path, method, { name: '<img src=x>', backgroundBehavior: 'Plain <b>literal</b>', notes: { gm: rich },
      attacks: [{ name: '<img src=x>', notes: rich }], abilities: [{ name: 'Effect', text: rich }], unrelated: rich });
    expect(body.backgroundBehavior).toBe('Plain <b>literal</b>'); expect(body.notes.gm).toBe(rich);
    expect(body.attacks[0].notes).toBe(rich); expect(body.abilities[0].text).toBe(rich);
    expect(body.name).not.toContain('<img'); expect(body.attacks[0].name).not.toContain('<img'); expect(body.unrelated).not.toBe(rich);
  });
  it('does not exempt unrelated routes or methods', () => {
    for (const [path, method] of [['/api/v1/game/content/items', 'POST'], ['/api/v1/game/content/combatants', 'PATCH'], ['/api/v1/game/adventures/admin/not-an-id', 'PUT']]) {
      expect(clean(path, method, { backgroundBehavior: rich, content: { summary: rich } }).backgroundBehavior).not.toBe(rich);
    }
  });
  it('retains existing character note behavior', () => {
    expect(clean('/api/v1/game/characters/111111111111111111111111', 'PUT', { sheet: { noteCards: [{ body: rich }] } }).sheet.noteCards[0].body).toBe(rich);
  });
});
