import type { RequestHandler } from 'express';

const xss = require('xss-clean');
const sanitize: RequestHandler = xss();

// Character notes intentionally store rich HTML. Their consumers must render it
// through an HTML allowlist (or as text), rather than interpolating raw HTML.
// Preserve only body strings; all other request data still passes through xss.
export const characterNoteHtml: RequestHandler = (req, res, next) => {
  const isCharacterUpdate = req.method === 'PUT' && /^\/api\/v1\/game\/characters\/[a-f\d]{24}\/?$/i.test(req.path);
  const arrays = isCharacterUpdate ? [req.body?.['sheet.noteCards'], req.body?.sheet?.noteCards] : [];
  const bodies = arrays.map((cards) => Array.isArray(cards)
    ? cards.map((card) => typeof card?.body === 'string' ? card.body : undefined)
    : undefined);

  sanitize(req, res, (error) => {
    if (error) return next(error);
    const sanitizedArrays = [req.body?.['sheet.noteCards'], req.body?.sheet?.noteCards];
    bodies.forEach((values, arrayIndex) => values?.forEach((body, index) => {
      if (body !== undefined && sanitizedArrays[arrayIndex]?.[index]) {
        sanitizedArrays[arrayIndex][index].body = body;
      }
    }));
    next();
  });
};
