import type { Request } from 'express';
import type { FileArray, UploadedFile } from 'express-fileupload';
import { Model } from 'mongoose';
import { parse } from 'csv-parse/sync';
import { ErrorUtil } from '../../../../../middleware/ErrorUtil';

export type CsvRow = Record<string, string>;
export type ImportMode = 'dry-run' | 'commit';

export interface CsvImportError {
  row: number;
  key?: string;
  field?: string;
  message: string;
}

export interface CsvImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  creates: number;
  updates: number;
}

export interface CsvImportResult {
  entityName: string;
  mode: ImportMode;
  success: boolean;
  summary: CsvImportSummary;
  errors: CsvImportError[];
}

export interface CsvImportDefinition<TDoc extends { key: string }, TContext = undefined> {
  entityName: string;
  model: Model<any>;
  requiredHeaders: string[];
  prepareContext?: (rows: CsvRow[]) => Promise<TContext>;
  parseRow: (row: CsvRow, rowNumber: number, context: TContext) => Promise<TDoc> | TDoc;
}

export function resolveImportMode(value: unknown): ImportMode {
  return value === 'commit' ? 'commit' : 'dry-run';
}

export function getUploadedCsvFile(req: Request): UploadedFile {
  const files = req.files as FileArray | undefined;

  if (!files || Object.keys(files).length === 0) {
    throw new ErrorUtil('A CSV file is required', 400);
  }

  const candidate = files.file || files.csv || Object.values(files)[0];
  const file = Array.isArray(candidate) ? candidate[0] : candidate;

  if (!file) {
    throw new ErrorUtil('A CSV file is required', 400);
  }

  const allowedMimeTypes = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain']);

  const hasCsvExtension = /\.csv$/i.test(file.name || '');
  if (!hasCsvExtension && !allowedMimeTypes.has(file.mimetype)) {
    throw new ErrorUtil('Only CSV uploads are supported', 400);
  }

  return file as UploadedFile;
}

export function parseCsvFile(file: UploadedFile): CsvRow[] {
  if (!file.data || file.data.length === 0) {
    throw new ErrorUtil('Uploaded CSV file is empty', 400);
  }

  const records = parse(file.data.toString('utf8'), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, unknown>>;

  const rows = records.map((record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [String(key).trim(), String(value ?? '').trim()])));

  if (rows.length === 0) {
    throw new ErrorUtil('Uploaded CSV file did not contain any data rows', 400);
  }

  return rows;
}

export async function runCsvImport<TDoc extends { key: string }, TContext = undefined>(
  definition: CsvImportDefinition<TDoc, TContext>,
  file: UploadedFile,
  mode: ImportMode
): Promise<CsvImportResult> {
  const rows = parseCsvFile(file);
  assertRequiredHeaders(rows, definition.requiredHeaders);

  const context = definition.prepareContext ? await definition.prepareContext(rows) : (undefined as TContext);

  const errors: CsvImportError[] = [];
  const documents: TDoc[] = [];
  const seenKeys = new Set<string>();

  for (let index = 0; index < rows.length; index++) {
    const rowNumber = index + 2; // header row is line 1
    const row = rows[index];

    try {
      const doc = await definition.parseRow(row, rowNumber, context);
      const key = normalizeKey(doc.key);

      if (!key) {
        throw new ErrorUtil('key is required', 400);
      }

      if (seenKeys.has(key)) {
        errors.push({
          row: rowNumber,
          key,
          field: 'key',
          message: `Duplicate key "${key}" in uploaded file`,
        });
        continue;
      }

      seenKeys.add(key);
      documents.push({
        ...doc,
        key,
      });
    } catch (err) {
      errors.push(toImportError(err, rowNumber, row.key));
    }
  }

  const keys = documents.map((doc) => normalizeKey(doc.key));

  const existingDocs =
    keys.length > 0
      ? await definition.model
          .find({ key: { $in: keys } })
          .select('key -_id')
          .lean()
      : [];

  const existingKeys = new Set(existingDocs.map((entry: any) => normalizeKey(entry.key)));

  const creates = documents.filter((doc) => !existingKeys.has(normalizeKey(doc.key))).length;
  const updates = documents.length - creates;

  const summary: CsvImportSummary = {
    totalRows: rows.length,
    validRows: documents.length,
    invalidRows: errors.length,
    creates,
    updates,
  };

  if (errors.length > 0 || mode === 'dry-run' || documents.length === 0) {
    return {
      entityName: definition.entityName,
      mode,
      success: errors.length === 0,
      summary,
      errors,
    };
  }

  const ops = documents.map((doc) => ({
    updateOne: {
      filter: { key: normalizeKey(doc.key) },
      update: { $set: doc },
      upsert: true,
    },
  }));

  await definition.model.bulkWrite(ops, { ordered: false });

  return {
    entityName: definition.entityName,
    mode,
    success: true,
    summary,
    errors: [],
  };
}

export function requireString(row: CsvRow, field: string, rowNumber: number): string {
  const value = String(row[field] ?? '').trim();
  if (!value) {
    throw new ErrorUtil(`${field} is required (row ${rowNumber})`, 400);
  }
  return value;
}

export function optionalString(row: CsvRow, field: string): string | null {
  const value = String(row[field] ?? '').trim();
  return value ? value : null;
}

export function splitList(value: unknown, delimiter = '|'): string[] {
  if (typeof value !== 'string') return [];
  return [
    ...new Set(
      value
        .split(delimiter)
        .map((part) => part.trim())
        .filter(Boolean)
    ),
  ];
}

export function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;

  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;

  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;

  throw new ErrorUtil(`Invalid boolean value "${value}"`, 400);
}

export function parseNumber(value: unknown, fallback: number | null = null): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new ErrorUtil(`Invalid number value "${value}"`, 400);
  }

  return parsed;
}

export function parseJsonCell<T>(value: unknown, fallback: T): T {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ErrorUtil(`Invalid JSON value "${raw}"`, 400);
  }
}

export function assertEnum(value: string, field: string, allowed: readonly string[]): string {
  if (!allowed.includes(value)) {
    throw new ErrorUtil(`${field} must be one of: ${allowed.join(', ')}`, 400);
  }
  return value;
}

export function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function assertRequiredHeaders(rows: CsvRow[], requiredHeaders: string[]) {
  const headers = Object.keys(rows[0] || {}).map((header) => header.trim());
  const missing = requiredHeaders.filter((header) => !headers.includes(header));

  if (missing.length > 0) {
    throw new ErrorUtil(`Missing required CSV columns: ${missing.join(', ')}`, 400);
  }
}

function toImportError(error: unknown, row: number, rawKey?: string): CsvImportError {
  if (error instanceof ErrorUtil) {
    return {
      row,
      key: rawKey ? normalizeKey(rawKey) : undefined,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      row,
      key: rawKey ? normalizeKey(rawKey) : undefined,
      message: error.message,
    };
  }

  return {
    row,
    key: rawKey ? normalizeKey(rawKey) : undefined,
    message: 'Unknown import error',
  };
}
