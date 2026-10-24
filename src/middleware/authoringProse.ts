import type { Request } from 'express';

/** Preserve only authoring prose strings through the generic HTML encoder.
 * These are untrusted stored strings: consumers must use a text/allowlist renderer.
 * The rich-text marker is a representation marker, never a trust marker.
 */
export function captureAuthoringProse(req: Request): () => void {
  const values: { path: (string | number)[]; value: string }[] = [];
  const read = (path: (string | number)[]) => path.reduce<any>((node, key) => node?.[key], req.body);
  const save = (path: (string | number)[]) => { const value = read(path); if (typeof value === 'string') values.push({ path, value }); };
  const each = (path: (string | number)[], visit: (path: (string | number)[]) => void) => {
    const items = read(path); if (Array.isArray(items)) items.forEach((_, i) => visit([...path, i]));
  };
  const route = (root: string) => (req.method === 'POST' && req.path.replace(/\/$/, '') === root) ||
    (req.method === 'PUT' && new RegExp(`^${root}/[a-f\\d]{24}/?$`, 'i').test(req.path));
  if (route('/api/v1/game/adventures/admin')) {
    save(['content', 'summary']);
    each(['content', 'sections'], path => {
      ['context', 'storyText', 'storyweaverNotes'].forEach(key => save([...path, key]));
      each([...path, 'links'], link => save([...link, 'context']));
    });
    each(['content', 'resources'], path => save([...path, 'text']));
    each(['content', 'encounters'], path => save([...path, 'notes']));
  }
  if (route('/api/v1/game/content/combatants')) {
    save(['backgroundBehavior']); save(['notes', 'public']); save(['notes', 'gm']);
    each(['attacks'], path => save([...path, 'notes']));
    each(['abilities'], path => save([...path, 'text']));
  }
  return () => values.forEach(({ path, value }) => {
    const parent = read(path.slice(0, -1)); if (parent && typeof parent === 'object') parent[path[path.length - 1]] = value;
  });
}
