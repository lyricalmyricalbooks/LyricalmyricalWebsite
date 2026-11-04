// One spreadsheet-safe CSV cell for every admin download: quoted, and a leading = + - @ tab or
// return gets an apostrophe so a spreadsheet never runs it as a formula. Plain numbers (including
// negatives such as a loss of -12.50) stay numbers, so SUM and AVERAGE still count them.
export function csvCell(v: unknown): string {
  const text = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
