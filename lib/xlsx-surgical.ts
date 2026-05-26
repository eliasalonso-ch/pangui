// Surgical .xlsx / .xlsm cell editor.
//
// Why this exists: SheetJS and ExcelJS both re-emit the workbook on write,
// which (a) drops the vbaProject in .xlsm files and (b) loses formatting on
// complex templates. For our company-template export use case we only need to
// overwrite specific cells, leaving everything else byte-identical to the
// original. So we unzip the workbook, mutate just the cells we care about in
// xl/worksheets/sheetN.xml, and re-zip.
//
// Limitations:
//   - Doesn't update sharedStrings.xml. Strings are written as inline strings
//     (t="inlineStr"), which Excel accepts on read.
//   - Cells we touch keep their existing `s` (style index) attribute. Cells we
//     create inherit the column/row style from the original sheet.
//   - We don't update cached calc results for cells with formulas that
//     reference the cells we change. Opening the file in Excel triggers a
//     recalc, which is fine.

import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

export type CellValue = string | number | boolean | null;

export interface CellEdit {
  row: number; // 1-indexed
  col: number; // 1-indexed
  value: CellValue;
}

// ── A1 helpers ───────────────────────────────────────────────────────────

export function colToLetter(n: number): string {
  // n is 1-indexed
  let s = "";
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export function cellRef(row: number, col: number): string {
  return `${colToLetter(col)}${row}`;
}

// ── XML helpers ──────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Match attribute on a tag: e.g. attr="value". Returns the value or null.
function readAttr(tag: string, attr: string): string | null {
  const m = tag.match(new RegExp(`\\s${attr}="([^"]*)"`));
  return m ? m[1] : null;
}

// ── Workbook structure parsing ───────────────────────────────────────────

interface WorkbookIndex {
  // sheet name → relative path inside the zip (e.g. "xl/worksheets/sheet1.xml")
  sheets: Map<string, string>;
  firstSheetPath: string;
}

function parseWorkbookIndex(files: Record<string, Uint8Array>): WorkbookIndex {
  const wbXml  = strFromU8(files["xl/workbook.xml"]);
  const relXml = strFromU8(files["xl/_rels/workbook.xml.rels"]);

  // Map rId → Target
  const ridToTarget = new Map<string, string>();
  for (const m of relXml.matchAll(/<Relationship[^>]*>/g)) {
    const tag = m[0];
    const id  = readAttr(tag, "Id");
    const target = readAttr(tag, "Target");
    if (id && target) ridToTarget.set(id, target);
  }

  const sheets = new Map<string, string>();
  let firstSheetPath = "";
  for (const m of wbXml.matchAll(/<sheet[^>]*\/>|<sheet[^>]*>/g)) {
    const tag = m[0];
    const name = readAttr(tag, "name");
    const rid  = readAttr(tag, "r:id") ?? readAttr(tag, "r:Id");
    if (!name || !rid) continue;
    const target = ridToTarget.get(rid);
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    sheets.set(name, path);
    if (!firstSheetPath) firstSheetPath = path;
  }

  return { sheets, firstSheetPath };
}

// ── Sheet XML mutation ──────────────────────────────────────────────────

// Builds the XML for a single <c> cell with value + (optional) style index.
function buildCellXml(ref: string, value: CellValue, styleAttr: string): string {
  if (value == null || value === "") {
    // Empty cell: just preserve style, no value/type. Excel treats this as
    // empty even if the cell existed before.
    return `<c r="${ref}"${styleAttr}/>`;
  }
  if (typeof value === "number" && isFinite(value)) {
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}"${styleAttr} t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  const s = String(value);
  // Inline string. xml:space="preserve" so leading/trailing whitespace stays.
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(s)}</t></is></c>`;
}

// Replace cells in a sheet XML string, given a map of ref → CellEdit.
// Strategy: find each <row r="N">…</row> block. For each row that contains
// edits, walk its <c> children, splice in the new <c>, append any cells that
// didn't exist. For rows that don't exist, generate a fresh <row>.
function mutateSheetXml(xml: string, edits: CellEdit[]): string {
  // Group edits by row number.
  const byRow = new Map<number, CellEdit[]>();
  for (const e of edits) {
    const arr = byRow.get(e.row) ?? [];
    arr.push(e);
    byRow.set(e.row, arr);
  }

  // Find <sheetData>…</sheetData>. Most workbooks have one.
  const sdMatch = xml.match(/<sheetData(\s[^>]*)?>([\s\S]*?)<\/sheetData>/);
  if (!sdMatch) {
    // <sheetData/> empty form. Replace with a <sheetData> containing fresh rows.
    const rows = Array.from(byRow.keys()).sort((a, b) => a - b);
    const newSheetData = rows.map(r => buildFreshRow(r, byRow.get(r)!)).join("");
    return xml.replace(/<sheetData\s*\/>/, `<sheetData>${newSheetData}</sheetData>`);
  }
  const sdInner = sdMatch[2];

  // Walk row blocks.
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let cursor = 0;
  const pieces: string[] = [];
  const handledRows = new Set<number>();

  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(sdInner)) !== null) {
    pieces.push(sdInner.slice(cursor, m.index));
    const rowTag = m[0];
    const rowOpenTag = rowTag.startsWith("<row") && rowTag.indexOf("/>") < 0
      ? rowTag.match(/^<row\b[^>]*>/)![0]
      : rowTag.match(/^<row\b[^>]*\/?>/)![0];
    const rowNum = parseInt(readAttr(rowOpenTag, "r") ?? "0", 10);
    const rowEdits = rowNum ? byRow.get(rowNum) : undefined;
    if (rowEdits && rowEdits.length > 0) {
      handledRows.add(rowNum);
      pieces.push(rewriteRow(rowTag, rowNum, rowEdits));
    } else {
      pieces.push(rowTag);
    }
    cursor = m.index + rowTag.length;
  }
  pieces.push(sdInner.slice(cursor));
  let newInner = pieces.join("");

  // Append rows that didn't exist before, in numerical order.
  const newRowNums = Array.from(byRow.keys()).filter(r => !handledRows.has(r)).sort((a, b) => a - b);
  if (newRowNums.length > 0) {
    const inserted = newRowNums.map(r => buildFreshRow(r, byRow.get(r)!)).join("");
    newInner += inserted;
  }

  const sdIndex = sdMatch.index ?? 0;
  return xml.slice(0, sdIndex) +
    `<sheetData${sdMatch[1] ?? ""}>${newInner}</sheetData>` +
    xml.slice(sdIndex + sdMatch[0].length);
}

// Rewrite a single existing row by splicing in or replacing the edited cells.
function rewriteRow(rowXml: string, rowNum: number, edits: CellEdit[]): string {
  // Self-closing row (<row r="N"/>) → expand.
  if (/<row\b[^>]*\/>$/.test(rowXml)) {
    const openTag = rowXml.replace(/\/>$/, ">");
    return `${openTag}${edits.map(e => buildCellXml(cellRef(e.row, e.col), e.value, "")).join("")}</row>`;
  }

  const openMatch = rowXml.match(/^<row\b[^>]*>/)!;
  const openTag   = openMatch[0];
  const inner     = rowXml.slice(openTag.length, -"</row>".length);

  // Build map of edits by column (1-indexed).
  const editByCol = new Map<number, CellEdit>();
  for (const e of edits) editByCol.set(e.col, e);

  // Walk existing <c> tags. Each gets either replaced (if its column matches
  // an edit) or kept as-is. The style attribute on the existing cell is
  // preserved when we replace.
  const cellRe = /<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g;
  const pieces: string[] = [];
  let cursor = 0;
  const writtenCols = new Set<number>();
  let mc: RegExpExecArray | null;
  while ((mc = cellRe.exec(inner)) !== null) {
    pieces.push(inner.slice(cursor, mc.index));
    const cellTag = mc[0];
    const openCellTag = cellTag.match(/^<c\b[^>]*\/?>/)![0];
    const ref = readAttr(openCellTag, "r");
    if (ref) {
      const colLetters = ref.match(/^[A-Z]+/)![0];
      const colNum = lettersToCol(colLetters);
      const edit = editByCol.get(colNum);
      if (edit) {
        const s = readAttr(openCellTag, "s");
        const styleAttr = s != null ? ` s="${s}"` : "";
        pieces.push(buildCellXml(ref, edit.value, styleAttr));
        writtenCols.add(colNum);
        cursor = mc.index + cellTag.length;
        continue;
      }
    }
    pieces.push(cellTag);
    cursor = mc.index + cellTag.length;
  }
  pieces.push(inner.slice(cursor));
  let newInner = pieces.join("");

  // Append cells for columns that didn't previously exist. We don't have
  // an existing style index for them, so omit `s` — Excel will fall back to
  // the row/column default style.
  const appended = edits
    .filter(e => !writtenCols.has(e.col))
    .sort((a, b) => a.col - b.col)
    .map(e => buildCellXml(cellRef(e.row, e.col), e.value, ""))
    .join("");
  newInner += appended;

  return `${openTag}${newInner}</row>`;
}

// Build a brand-new <row> from scratch (used when the row didn't exist).
function buildFreshRow(rowNum: number, edits: CellEdit[]): string {
  const cells = edits
    .slice()
    .sort((a, b) => a.col - b.col)
    .map(e => buildCellXml(cellRef(e.row, e.col), e.value, ""))
    .join("");
  return `<row r="${rowNum}">${cells}</row>`;
}

function lettersToCol(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

// ── Public API ───────────────────────────────────────────────────────────

export interface EditOptions {
  // Sheet name. Falls back to the first sheet when omitted or not found.
  sheetName?: string | null;
}

export async function editXlsxCells(
  buffer: ArrayBuffer,
  edits: CellEdit[],
  options: EditOptions = {},
): Promise<Uint8Array> {
  const files = unzipSync(new Uint8Array(buffer));

  const index = parseWorkbookIndex(files);
  let sheetPath = options.sheetName ? index.sheets.get(options.sheetName) : undefined;
  if (!sheetPath) sheetPath = index.firstSheetPath;
  if (!sheetPath || !files[sheetPath]) {
    throw new Error("No se encontró la hoja en el archivo.");
  }

  const sheetXml = strFromU8(files[sheetPath]);
  const newXml   = mutateSheetXml(sheetXml, edits);
  files[sheetPath] = strToU8(newXml);

  // Re-zip with no compression bump — same level avoids drift in unrelated files.
  return zipSync(files, { level: 6 });
}
