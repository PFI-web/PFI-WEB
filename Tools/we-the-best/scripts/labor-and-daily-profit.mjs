// SUPERSEDED for new days: the onEdit Apps Script now auto-fills Profit and builds daily
// totals as you type. Keep this only for a bulk re-stamp of Profit formulas + day totals
// across the whole tab at once. (Note: it normalizes Amount/Part Cost to positive numbers.)
import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const TAB = "Transactions (Jun 13+)";
const Q = `'${TAB}'`; // quoted for A1 ranges
const sa = JSON.parse(readFileSync("../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const absnum = (s) => { const m = String(s ?? "").match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };

// Layout (Labor column removed 2026-06-29):
//   C Amount Paid | D Part Cost | E Profit | F Date | G Type | H Tip | I Notes | J Inv Item
const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${Q}!A1:J80` })).data.values || [];

const data = [];
const dayProfit = {};       // date -> profit (Σ amt − Σ cost)
const totalRows = [];       // {rowNum, date}
let nProfit = 0;

for (let i = 1; i < rows.length; i++) {
  const r = rows[i] || [];
  const prod = (r[0] || "").trim();
  const type = (r[6] || "").trim();   // G = Type
  const rn = i + 1;

  const tm = prod.match(/^total made\s+(.+)$/i);
  if (tm) { totalRows.push({ rowNum: rn, date: tm[1].trim() }); continue; }
  if (!type) continue; // blank separators

  const amt = absnum(r[2]);   // Amount Paid (C)
  const cost = absnum(r[3]);  // Part Cost (D)
  const date = (r[5] || "").trim();   // F = Date

  // normalize money cells (positive); Profit (E) = Amount Paid - Part Cost, reads C-D directly.
  data.push({ range: `${Q}!C${rn}`, values: [[amt == null ? "" : amt]] });
  data.push({ range: `${Q}!D${rn}`, values: [[cost == null ? "" : cost]] });
  data.push({ range: `${Q}!E${rn}`, values: [[`=IF(C${rn}="","",C${rn}-N(D${rn}))`]] });
  nProfit++;

  dayProfit[date] = (dayProfit[date] || 0) + (amt || 0) - (cost || 0);
}

// rewrite each day-total row to PURE PROFIT, in the Profit column (E); clear gross (C)
for (const t of totalRows) {
  const profit = Math.round((dayProfit[t.date] || 0) * 100) / 100;
  data.push({ range: `${Q}!A${t.rowNum}`, values: [[`Total made (profit) ${t.date}`]] });
  data.push({ range: `${Q}!C${t.rowNum}`, values: [[""]] });          // clear gross
  data.push({ range: `${Q}!E${t.rowNum}`, values: [[profit]] });      // profit under Profit
}

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data } });

// currency format across Part Cost, Profit (D:E)
const sid = (await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" })).data.sheets.find((s) => s.properties.title === TAB).properties.sheetId;
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [
  { repeatCell: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } }, fields: "userEnteredFormat.numberFormat" } },
] } });

console.log(`Profit formulas on ${nProfit} rows. Daily PURE PROFIT:`);
for (const t of totalRows) console.log(`  ${t.date}: $${Math.round((dayProfit[t.date] || 0) * 100) / 100}  (row ${t.rowNum})`);
console.log(`  June 13-19 total profit: $${Math.round(Object.values(dayProfit).reduce((a, b) => a + b, 0) * 100) / 100}`);
