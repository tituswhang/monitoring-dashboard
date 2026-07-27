// Minimal, dependency-free .xlsx writer.
//
// Produces a valid Office Open XML workbook (a ZIP of a few XML parts) entirely
// in the browser — no SheetJS / ag-grid-enterprise required. Cells are written
// as inline strings so values are preserved exactly (large order ids keep their
// digits instead of being coerced to floats / scientific notation).

// ── CRC32 (for ZIP entries) ────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── ZIP (store / no compression) ───────────────────────────────────────────
interface ZipEntry { name: string; data: Uint8Array }

function zipStore(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true);         // version needed
    lv.setUint16(6, 0, true);          // flags
    lv.setUint16(8, 0, true);          // method = stored
    lv.setUint16(10, 0, true);         // mod time
    lv.setUint16(12, 0, true);         // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);      // compressed size
    lv.setUint32(22, size, true);      // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);         // extra length
    local.set(nameBytes, 30);
    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(4, 20, true);         // version made by
    cv.setUint16(6, 20, true);         // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);    // local header offset
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);   // end of central directory signature
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);      // central directory offset

  // Runtime values are all ArrayBuffer-backed Uint8Arrays; the cast satisfies
  // the DOM lib's BlobPart type (which excludes SharedArrayBuffer-backed views).
  return new Blob([...localParts, ...centralParts, end] as unknown as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── XLSX assembly ──────────────────────────────────────────────────────────
// Strip C0 control characters Excel rejects (tab/newline/return are allowed).
// Done by char code rather than a regex so we don't embed control characters
// in a pattern (flagged by SonarQube typescript:S6324).
function stripInvalidXmlChars(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0x1f || code === 0x09 || code === 0x0a || code === 0x0d) {
      out += value[i];
    }
  }
  return out;
}

function escapeXml(value: string): string {
  return stripInvalidXmlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// Excel sheet names: max 31 chars, no : \ / ? * [ ]
function safeSheetName(name: string): string {
  const cleaned = (name || "Sheet1").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return cleaned || "Sheet1";
}

function sheetXml(headers: string[], rows: string[][]): string {
  const all = [headers, ...rows];
  const body = all
    .map((cells, r) => {
      const cellXml = cells
        .map((value, c) => {
          const ref = `${columnLetter(c)}${r + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value ?? "")}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cellXml}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

/** Build an .xlsx workbook Blob from a header row and string rows. */
export function buildXlsxBlob(sheetName: string, headers: string[], rows: string[][]): Blob {
  const enc = new TextEncoder();
  const sheet = safeSheetName(sheetName);
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc.encode(workbookXml(sheet)) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(WORKBOOK_RELS) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml(headers, rows)) },
  ]);
}

/** Build an .xlsx and trigger a browser download. */
export function downloadXlsx(fileName: string, sheetName: string, headers: string[], rows: string[][]): void {
  const blob = buildXlsxBlob(sheetName, headers, rows);
  const safeFile = (fileName || "export").replace(/[\\/:*?"<>|]/g, "_");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFile.toLowerCase().endsWith(".xlsx") ? safeFile : `${safeFile}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
