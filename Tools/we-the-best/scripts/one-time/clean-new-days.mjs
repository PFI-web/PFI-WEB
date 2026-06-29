import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const TAB = "Transactions (Jun 13+)";
const Q = `'${TAB}'`;
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const titleCase = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const normPay = (s) => { const t = (s || "").trim().toLowerCase(); if (/credit|card/.test(t)) return "Card reader"; if (/zelle|selle/.test(t)) return "Zelle"; if (/cash/.test(t)) return "Cash"; if (/n\/?a/.test(t)) return "N/A"; return titleCase(t); };
const cleanProd = (s) => titleCase((s || "").trim().toLowerCase().replace(/\buse\b/g, "used").replace(/\bdeposito\b/g, "deposit").replace(/\s+/g, " ").trim());

const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${Q}!A1:I140` })).data.values || [];

// per-row overrides for the messy rows (matched by product text, not row number, for safety)
const overrides = {
  "expense: office": { A: "Office Supplies", G: "Expense", I: "Dollartree — miscellaneous" },
  "deposito": { A: "Deposit", G: "Mechanic", I: "Job $400 total; plate MWG9136 (this is a $200 deposit of $400)", flag: true },
};

const data = [];
const flagRows = [];
const day22 = []; // row numbers of 6/22 rows (for total range)
let lastDate = null;

for (let i = 1; i < rows.length; i++) {
  const r = rows[i] || [];
  const date = (r[5] || "").trim();
  const is22 = /^0?6\/22\/(2026|26)/.test(date);
  const is23 = /^0?6\/23\/(2026|26)/.test(date);
  if (!is22 && !is23) continue;
  const rn = i + 1;
  const prodKey = (r[0] || "").trim().toLowerCase();
  const ov = overrides[prodKey];

  data.push({ range: `${Q}!A${rn}`, values: [[ov?.A ?? cleanProd(r[0])]] });        // Product (text)
  data.push({ range: `${Q}!B${rn}`, values: [[normPay(r[1])]] });                    // Payment (text)
  data.push({ range: `${Q}!F${rn}`, values: [[is22 ? "6/22/26" : "6/23/26"]] });     // Date (reformat)
  data.push({ range: `${Q}!D${rn}`, values: [[`=IF(C${rn}="","",C${rn}-N(E${rn}))`]] }); // Labor (derived formula)
  if (ov?.G) data.push({ range: `${Q}!G${rn}`, values: [[ov.G]] });                  // Type (fix miscategorization)
  if (ov?.I) data.push({ range: `${Q}!I${rn}`, values: [[ov.I]] });                  // Notes

  // FLAG (never auto-add a part cost): $80 / combo oil change likely used shop oil
  const isOil = /oil change/i.test(r[0] || "");
  const amt = parseFloat(String(r[2]).replace(/[^\d.]/g, "")) || 0;
  if (isOil && (amt === 80 || /\+|&|check|brake|tire/i.test(r[0]))) {
    data.push({ range: `${Q}!I${rn}`, values: [["$80 oil change — likely shop oil; add $30 in Part Cost if so (not added automatically)"]] });
    flagRows.push(i);
  }
  if (ov?.flag) flagRows.push(i);

  if (is22) day22.push(rn);
}

// 6/22 daily total (live formula) in the gap row after the last 6/22 row; NOT for 6/23
let totalRow = null;
if (day22.length) {
  const first = Math.min(...day22), last = Math.max(...day22);
  totalRow = last + 1; // the blank gap row
  data.push({ range: `${Q}!A${totalRow}`, values: [["Total made (profit) 6/22/26"]] });
  data.push({ range: `${Q}!D${totalRow}`, values: [[`=SUM(C${first}:C${last})-SUM(E${first}:E${last})`]] });
}

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data } });

// formatting
const sid = (await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" })).data.sheets.find((s) => s.properties.title === TAB).properties.sheetId;
const reqs = [
  { repeatCell: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } }, fields: "userEnteredFormat.numberFormat" } },
];
if (totalRow) reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: totalRow - 1, endRowIndex: totalRow, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 1, green: 0.95, blue: 0.7 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } });
for (const i of flagRows) reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.98, green: 0.8, blue: 0.8 } } }, fields: "userEnteredFormat.backgroundColor" } });
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

console.log(`Cleaned ${day22.length} rows for 6/22 (+ total row ${totalRow}). Cleaned 6/23 rows (no total). Flagged ${flagRows.length} rows for review.`);
