/**
 * The one place CSV text is written.
 *
 * Every CSV the application produces goes through here, so the rules below hold
 * for the calculation report, the blank templates and the "current data"
 * downloads alike.
 *
 * File format for Windows Excel:
 *  - UTF-8 with a byte-order mark. Without the BOM, Excel assumes the legacy
 *    Windows-1252 code page and shows "—" as "â€”". Text is never rewritten to
 *    ASCII to avoid this; the BOM is what makes the real characters readable.
 *  - CRLF between rows. Line breaks inside a quoted field are a single LF,
 *    which is how Excel itself stores a line break within a cell.
 *  - Fields containing a comma, quote or line break are quoted, and embedded
 *    quotes are doubled.
 *
 * Formula safety: a cell that begins with = + - @ (or tab / carriage return) can
 * be executed as a formula when the file is opened in a spreadsheet. Text cells
 * like that get a leading apostrophe. Cells that are plain numbers, including
 * negative amounts such as -25000.00 and formatted amounts such as -$25,000.00,
 * are left exactly as they are, because a value made only of digits, separators
 * and a currency sign cannot run anything.
 *
 * Known limitation: this protection is one-way. The importer does NOT strip a
 * leading apostrophe, because an apostrophe at the start of imported text is
 * ambiguous (it may be protection, or it may be the user's own data), and
 * guessing wrong would silently alter the original. So text that began with
 * = + - @ comes back from a re-import with the protective apostrophe still on
 * it. That is visible and harmless; a silent edit would not be.
 */

export const CSV_BOM = '\uFEFF';
export const CSV_ROW_END = '\r\n';
export const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
/** Digits with optional sign, thousands separators, decimals, one currency sign. */
const NUMERIC_LIKE = /^[-+]?\$?[-+]?\d[\d,]*(\.\d+)?%?$/;

export function protectFormula(value: string): string {
  if (NUMERIC_LIKE.test(value)) return value;
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

/** One field, escaped and formula-protected. */
export function csvField(raw: string): string {
  // Line breaks inside a field are a single LF, matching Excel's own convention.
  const value = protectFormula(raw.replace(/\r\n?/g, '\n'));
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvRow(cells: readonly string[]): string {
  return cells.map(csvField).join(',');
}

/**
 * A complete document. Every row is padded to the same number of fields, so the
 * file is a regular grid rather than a ragged one that some tools reject.
 */
export function csvDocument(rows: readonly (readonly string[])[]): string {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const padded = rows.map((row) =>
    row.length < width ? [...row, ...Array<string>(width - row.length).fill('')] : row,
  );
  return padded.map(csvRow).join(CSV_ROW_END) + CSV_ROW_END;
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** The exact bytes of a download: UTF-8, with a BOM added once. */
export function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(CSV_BOM + stripBom(text));
}
