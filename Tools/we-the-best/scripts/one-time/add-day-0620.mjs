import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const TAB = "Transactions (Jun 13+)";
const Q = `'${TAB}'`;
const TARGET = /^(0?6\/20\/(2026|26))/; // 6/20 in either format
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const titleCase = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const absnum = (s) => { const m = String(s ?? "").match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };
const normPay = (s) => { const t = (s || "").trim().toLowerCase(); if (/credit|card/.test(t)) return "Card reader"; if (/zelle|selle/.test(t)) return "Zelle"; if (/cash/.test(t)) return "Cash"; if (/n\/?a/.test(t)) return "N/A"; return titleCase(t); };
function cleanProd(s) {
  let t = (s || "").trim().toLowerCase();
  if (t === "cv") return "CV Axle";
  t = t.replace(/\bchekeo\b/g, "check").replace(/\buse\b/g, "used").replace(/\s+y\s+/g, " + ").replace(/\s+/g, " ").trim();
  return titleCase(t);
}

const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${Q}!A1:I200` })).data.values || [];

const data = [];
let profit = 0, lastRow = 0, n = 0, hasTotal = false;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i] || [];
  const date = (r[5] || "").trim();
  if (/^total made.*6\/20/i.test((r[0] || ""))) hasTotal = true;
  if (!TARGET.test(date)) continue;
  const rn = i + 1;
  const product = cleanProd(r[0]);
  const amt = absnum(r[2]);
  let cost = absnum(r[4]);
  // oil-change combo / $80 rule -> $30 oil cost
  if (/oil change/i.test(product) && (amt === 80 || /\+|&|check|brake|tire|antifreeze/i.test(product)) && cost == null) cost = 30;

  data.push({ range: `${Q}!A${rn}`, values: [[product]] });
  data.push({ range: `${Q}!B${rn}`, values: [[normPay(r[1])]] });
  data.push({ range: `${Q}!C${rn}`, values: [[amt == null ? "" : amt]] });
  data.push({ range: `${Q}!E${rn}`, values: [[cost == null ? "" : cost]] });
  data.push({ range: `${Q}!D${rn}`, values: [[`=IF(C${rn}="","",C${rn}-N(E${rn}))`]] });
  data.push({ range: `${Q}!F${rn}`, values: [["6/20/26"]] });
  profit += (amt || 0) - (cost || 0);
  lastRow = rn; n++;
}

if (!n) { console.log("No 6/20 rows found."); process.exit(0); }
const totalRow = hasTotal ? null : lastRow + 1;
if (totalRow) {
  data.push({ range: `${Q}!A${totalRow}`, values: [["Total made (profit) 6/20/26"]] });
  data.push({ range: `${Q}!D${totalRow}`, values: [[Math.round(profit * 100) / 100]] });
}
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data } });

// formatting
const sid = (await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" })).data.sheets.find((s) => s.properties.title === TAB).properties.sheetId;
const reqs = [
  { repeatCell: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } }, fields: "userEnteredFormat.numberFormat" } },
];
if (totalRow) reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: totalRow - 1, endRowIndex: totalRow, startColumnIndex: 0, endColumnIndex: 9 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 1, green: 0.95, blue: 0.7 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } });
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

console.log(`Processed ${n} rows for 6/20. Pure profit: $${Math.round(profit * 100) / 100}${totalRow ? ` (total row ${totalRow})` : " (total already existed)"}`);
