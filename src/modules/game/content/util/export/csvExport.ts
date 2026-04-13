import { Response } from 'express';

export interface CsvExportDefinition<TDoc> {
  entityName: string;
  columns: Array<{
    header: string;
    serialize: (doc: TDoc) => string;
  }>;
}

/**
 * Escapes a single CSV cell value per RFC 4180.
 * Wraps the value in double-quotes when it contains a comma, double-quote, or newline.
 * Internal double-quotes are escaped by doubling them.
 */
export function escapeCsvValue(value: string): string {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Builds a CSV string from a set of documents using the provided export definition.
 * Returns an empty-body CSV (header only) when docs is empty.
 */
export function runCsvExport<TDoc>(definition: CsvExportDefinition<TDoc>, docs: TDoc[]): string {
  const headerRow = definition.columns.map((col) => escapeCsvValue(col.header)).join(',');

  const dataRows = docs.map((doc) => definition.columns.map((col) => escapeCsvValue(col.serialize(doc))).join(','));

  return [headerRow, ...dataRows].join('\r\n');
}

/**
 * Sends a CSV string as a file download response.
 * Sets Content-Type and Content-Disposition headers then ends the response.
 */
export function sendCsvResponse(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).end(csv);
}
