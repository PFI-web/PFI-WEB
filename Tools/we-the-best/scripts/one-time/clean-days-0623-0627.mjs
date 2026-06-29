// Clean the new days 6/23–6/27 on "Transactions (Jun 13+)".
// SAFE: only derives/normalizes. NEVER touches owner numbers
// (Amount Paid C, Part Cost E, Date F, Tip H) or the Inv Item link (J).
// Writes: Product (A, text normalize), Payment (B, normalize), Labor (D, derived formula),
//         Type (G, category normalize), Notes (I, flag notes only), + daily total rows.
import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const TAB = "Transactions (Jun 13+)";
const Q = `'${TAB}'`;
const APPLY = process.argv.includes("--apply");
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const titleCase = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function cleanProd(s) {
  let t = (s || "").trim().toLowerCase().replace(/\s+/g, " ");
  t = t.replace(/\baternador\b/g, "alternator");      // ES alternador -> Alternator
  t = t.replace(/\buse\b/g, "used");                  // "1 use tire" -> used tire
  t = t.replace(/\bsensor oxygen\b/g, "oil sensor");  // shop: "oxygen" means oil
  t = t.replace(/\boxygen sensor\b/g, "oil sensor");
  t = t.replace(/\blights inst\b/g, "lights installation");
  t = t.replace(/^inst /, "install ");
  let out = titleCase(t).replace(/\bIm\b/g, "IM");    // (Im Only) -> (IM Only)
  return out;
}
function normPay(s) {
  const t = (s || "").trim().toLowerCase();
  const parts = [];
  if (/cash/.test(t)) parts.push("Cash");
  if (/credit|card/.test(t)) parts.push("Card reader");
  if (/zelle|selle/.test(t)) parts.push("Zelle");
  if (parts.length) return parts.join(" + ");
  if (/n\/?a/.test(t)) return "N/A";
  if (/free/.test(t)) return "Free";
  return titleCase(t);
}
function normType(s) {
  const t = (s || "").trim().toLowerCase();
  if (t === "parts") return "Expense"; // row 127: negative parts expense -> Expense
  if (t === "gomero") return "Gomero";
  if (t === "mechanic") return "Mechanic";
  if (t === "inspector") return "Inspector";
  if (t === "expense") return "Expense";
  return titleCase(t);
}

// Day groups (verified from the live sheet). first..last = data rows; total = gap row for the day total.
const DAYS = [
  { date: "6/23/26", mmdd: "06/23/2026", first: 113, last: 121, total: 122 },
  { date: "6/24/26", mmdd: "06/24/2026", first: 124, last: 136, total: 137 },
  { date: "6/25/26", mmdd: "06/25/2026", first: 139, last: 149, total: 150 },
  { date: "6/26/26", mmdd: "06/26/2026", first: 152, last: 161, total: 162 },
  { date: "6/27/26", mmdd: "06/27/2026", first: 164, last: 182, total: 183 },
];

// Flag notes (never auto-add Part Cost; flag for the owner instead).
const FLAG_NOTE = {
  113: "$80 oil change — likely shop oil; add $30 in Part Cost if so (not added automatically)",
  127: "RECONCILE: amount -$100 AND part cost $100 both entered (Andres car to sale) — figures double-count, please confirm",
  175: "Oil change $90 — verify: labor only, or does it include oil cost?",
};

const fv = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${Q}!A1:J185`, valueRenderOption: "FORMATTED_VALUE" })).data.values || [];
const row = (n) => fv[n - 1] || [];

// sanity: confirm each day's first/last row date matches expectation before writing anything
for (const d of DAYS) {
  for (const rn of [d.first, d.last]) {
    const got = String(row(rn)[5] || "").trim();
    if (got !== d.mmdd) { console.error(`ABORT: row ${rn} date is "${got}", expected "${d.mmdd}" for day ${d.date}`); process.exit(1); }
  }
  const tot = String(row(d.total)[0] || "").trim();
  if (tot && !/^Total made/.test(tot)) { console.error(`ABORT: total row ${d.total} is not empty/total: "${tot}"`); process.exit(1); }
}

const data = [];
const flagRows = [];
const totalRows = [];

for (const d of DAYS) {
  for (let rn = d.first; rn <= d.last; rn++) {
    const r = row(rn);
    const prod = r[0] || "";
    if (!String(prod).trim() && !String(r[2] || "").trim()) continue; // skip blanks
    const newProd = cleanProd(prod);
    const newPay = normPay(r[1]);
    const newType = normType(r[6]);
    data.push({ range: `${Q}!A${rn}`, values: [[newProd]] });
    data.push({ range: `${Q}!B${rn}`, values: [[newPay]] });
    data.push({ range: `${Q}!D${rn}`, values: [[`=IF(C${rn}="","",C${rn}-N(E${rn}))`]] });
    data.push({ range: `${Q}!G${rn}`, values: [[newType]] });
    if (FLAG_NOTE[rn]) {
      data.push({ range: `${Q}!I${rn}`, values: [[FLAG_NOTE[rn]]] });
      flagRows.push(rn);
    }
    console.log(`r${rn}: "${prod}"->"${newProd}" | pay "${r[1] || ""}"->"${newPay}" | type "${r[6] || ""}"->"${newType}"${FLAG_NOTE[rn] ? "  [FLAG]" : ""}`);
  }
  // daily total (live formula) in the gap row
  data.push({ range: `${Q}!A${d.total}`, values: [[`Total made (profit) ${d.date}`]] });
  data.push({ range: `${Q}!D${d.total}`, values: [[`=SUM(C${d.first}:C${d.last})-SUM(E${d.first}:E${d.last})`]] });
  totalRows.push(d.total);
  console.log(`  -> total row ${d.total}: =SUM(C${d.first}:C${d.last})-SUM(E${d.first}:E${d.last})`);
}

if (!APPLY) { console.log(`\nDRY RUN — ${data.length} cell writes planned across ${DAYS.length} days. Re-run with --apply to write.`); process.exit(0); }

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data } });

// formatting
const sid = (await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" })).data.sheets.find((s) => s.properties.title === TAB).properties.sheetId;
const reqs = [
  // currency on Amount/Labor/Part Cost (C:E) across the new block
  { repeatCell: { range: { sheetId: sid, startRowIndex: 112, endRowIndex: 183, startColumnIndex: 2, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } }, fields: "userEnteredFormat.numberFormat" } },
];
for (const tr of totalRows) reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: tr - 1, endRowIndex: tr, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 1, green: 0.95, blue: 0.7 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } });
for (const fr of flagRows) reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: fr - 1, endRowIndex: fr, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.98, green: 0.8, blue: 0.8 } } }, fields: "userEnteredFormat.backgroundColor" } });
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

console.log(`\nAPPLIED. ${data.length} cell writes. Total rows: ${totalRows.join(", ")}. Flagged: ${flagRows.join(", ")}.`);
