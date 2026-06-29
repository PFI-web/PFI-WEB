import { google } from "googleapis";
import { readFileSync } from "fs";

const DRY = !process.argv.includes("--write");
const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const TAB = "Tire Inventory";
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const titleCase = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const numOnly = (s) => { const m = String(s).match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };
function normPay(raw) {
  const t = (raw || "").trim().toLowerCase();
  if (!t) return "";
  if (/credit|card/.test(t)) return "Card reader";
  if (/zelle|selle/.test(t)) return "Zelle";
  if (/cash/.test(t)) return "Cash";
  return titleCase(t);
}
function cleanNote(s) {
  let t = String(s || "").trim();
  if (!t) return "";
  t = t.replace(/deposit of\s*\$?([\d.]+)/i, (m, n) => `Deposit of $${(+n).toFixed(2)}`);
  t = t.replace(/\b17\s*st\b/gi, "17 ST"); // normalize the "17 ST" code
  t = t.replace(/\bthomas\b/gi, "Thomas").replace(/\s+/g, " ").trim();
  return t;
}

const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A1:G60` });
const raw = (res.data.values || []).slice(1); // drop old header

const rows = [];
for (const r of raw) {
  const [qty, size, sold, total, note, pay, left] = [r[0], r[1], r[2], r[3], r[4], r[5], r[6]].map((x) => (x ?? "").toString().trim());
  if (!size) continue; // skip blanks
  const hasSale = sold || total || note || pay || left;
  rows.push({
    qty: numOnly(qty),
    size,
    sold: sold ? numOnly(sold) : (hasSale ? numOnly(sold) : 0),
    total: total ? numOnly(total) : null,
    note: cleanNote(note),
    pay: normPay(pay),
    left: left ? numOnly(left) : (hasSale ? null : numOnly(qty)),
  });
}
// sort by rim diameter, then section width, then aspect ratio
const key = (s) => { const p = s.split("-").map(Number); return [p[2] || 0, p[0] || 0, p[1] || 0]; };
rows.sort((a, b) => { const ka = key(a.size), kb = key(b.size); return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]; });

const header = ["Qty Stocked", "Tire Size", "Sold", "Sale Total", "Notes", "Payment", "Qty Left"];
const out = [header];
let totSold = 0, totRev = 0;
for (const r of rows) {
  totSold += r.sold || 0; totRev += r.total || 0;
  out.push([r.qty ?? "", r.size, r.sold ?? "", r.total ?? "", r.note, r.pay, r.left ?? ""]);
}
out.push(["", "TOTAL", totSold, totRev, "", "", ""]);

console.log("DRY:", DRY, "| tire rows:", rows.length, "| total sold:", totSold, "| total revenue: $" + totRev);
out.forEach((r) => console.log("  " + JSON.stringify(r)));

if (!DRY) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" });
  const src = meta.data.sheets.find((s) => s.properties.title === TAB);
  const bk = meta.data.sheets.find((s) => s.properties.title === "Tire Inventory (raw backup)");
  const reqs = [];
  if (bk) reqs.push({ deleteSheet: { sheetId: bk.properties.sheetId } });
  reqs.push({ duplicateSheet: { sourceSheetId: src.properties.sheetId, newSheetName: "Tire Inventory (raw backup)" } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: TAB });
  await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${TAB}!A1`, valueInputOption: "USER_ENTERED", requestBody: { values: out } });

  const sid = src.properties.sheetId;
  const last = out.length - 1;
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
    { repeatCell: { range: { sheetId: sid, startRowIndex: last, endRowIndex: last + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat" } },
    { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } }, fields: "userEnteredFormat.numberFormat" } },
    { autoResizeDimensions: { dimensions: { sheetId: sid, dimension: "COLUMNS", startIndex: 0, endIndex: 7 } } },
  ] } });
  console.log(`\nWROTE cleaned "${TAB}" (${rows.length} tires), backup at "Tire Inventory (raw backup)".`);
}
