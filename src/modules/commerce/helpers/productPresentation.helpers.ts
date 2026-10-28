import { ErrorUtil } from '../../../middleware/ErrorUtil';
import type { ProductPresentation } from '../models/ProductModel';

export function validateProductType(value: unknown): void {
  if (typeof value !== 'string' || !['book', 'merchandise', 'other'].includes(value)) {
    throw new ErrorUtil('Product type must be book, merchandise or other', 400);
  }
}

function imageUrl(value: unknown, role: string): string {
  if (typeof value !== 'string') throw new ErrorUtil(`${role} must be a URL or an empty string`, 400);
  const normalized = value.trim();
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return normalized;
  } catch { /* Use the same validation error for malformed and unsupported URLs. */ }
  throw new ErrorUtil(`${role} must be an HTTP or HTTPS URL without credentials`, 400);
}

export function normalizeProductPresentation(value: unknown, previous?: ProductPresentation): ProductPresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ErrorUtil('Presentation must be an object; clear individual images with an empty string', 400);
  }
  const input = value as Record<string, unknown>;
  const result: ProductPresentation = {};
  for (const role of ['imageUrl', 'coverImageUrl', 'bannerImageUrl', 'productImageUrl'] as const) {
    if (!(role in input)) continue;
    // An unrelated edit must not invalidate or rewrite historical media values.
    result[role] = previous && input[role] === previous[role] ? previous[role] : imageUrl(input[role], role);
  }
  if ('gallery' in input) {
    if (!Array.isArray(input.gallery)) throw new ErrorUtil('Gallery must be an array', 400);
    if (previous && JSON.stringify(input.gallery) === JSON.stringify(previous.gallery)) result.gallery = previous.gallery;
    else result.gallery = input.gallery.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new ErrorUtil('Invalid gallery image', 400);
      const image = entry as Record<string, unknown>;
      const url = imageUrl(image.url, 'Gallery image');
      if (!url) throw new ErrorUtil('Gallery images need a URL', 400);
      for (const key of ['alt', 'caption']) {
        if (image[key] !== undefined && typeof image[key] !== 'string') throw new ErrorUtil(`Gallery ${key} must be text`, 400);
      }
      return { url, ...(typeof image.alt === 'string' ? { alt: image.alt.trim() } : {}), ...(typeof image.caption === 'string' ? { caption: image.caption.trim() } : {}) };
    });
  }
  return result;
}
