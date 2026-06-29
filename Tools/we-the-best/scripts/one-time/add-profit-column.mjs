/**
 * Add a dedicated PROFIT column to "Transactions (Jun 13+)" and restore the
 * Labor column to its real meaning ("what we charge the customer for labor").
 *
 * BEFORE:  C Amount Paid | D Labor(=C-E, i.e. the profit) | E Part Cost | F Date | ... | J Inv Item
 * AFTER:   C Amount Paid | D Labor | E Part Cost | F Profit(=C-E) | G Date | ... | K Inv Item
 *
 *  - Inserts ONE new column F = "Profit".
 *  - Per-row Profit  = =IF(C="","",C-N(E))   (Amount Paid - Part Cost) -- the bottom line.
 *  - Per-row Labor (D) keeps its existing =IF(C="","",C-N(E)) formula as the default
 *    "labor charge" (their model: Amount Paid = Labor + Part Cost). It is now EDITABLE:
 *    on a pure parts/tire sale, the owner can overwrite it with the real labor (often $0)
 *    and Profit still shows the true margin, because Profit reads C-E directly (not Labor).
 *  - Daily "Total made" rows: the day's profit moves from the Labor column into the Profit
 *    column (same =SUM(C..)-SUM(E..) formula); the Labor cell on those rows is cleared.
 *  - Owner numbers (Amount Paid, Part Cost, Date, Type, Tip, Inv Item) are NOT touched.
 *
 * Inserting a column shifts Date F->G and Inv Item J->K, so the onEdit Apps Script must be
 * updated (col 10->11, col 6->7) and re-pasted by the owner -- handled separately.
 *
 * Dry-run by default. Pass --apply to write.
 */
import { google } from "googleapis";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const TAB = "Transactions (Jun 13+)";
const Q = `'${TAB}'`;
const KEY = "../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json";
const sa = JSON.parse(readFileSync(KEY, "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const meta = (await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" })).data.sheets;
const sid = meta.find((s) => s.properties.title === TAB).properties.sheetId;

// Read current contents (formulas) to find data rows vs daily-total rows.
const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${Q}!A1:J200`, valueRenderOption: "FORMULA" })).data.values || [];

const dataRows = [];   // row numbers (1-based) of real transactions
const totalRows = [];  // { rowNum, sumFormula }
for (let i = 1; i < rows.length; i++) {
  const r = rows[i] || [];
  const prod = (r[0] || "").toString().trim();
  const type = (r[6] || "").toString().trim(); // G = Type (pre-insert)
  const rn = i + 1;
  if (/^total made/i.test(prod)) {
    totalRows.push({ rowNum: rn, sumFormula: (r[3] || "").toString() }); // D = Labor holds the SUM
    continue;
  }
  if (type) dataRows.push(rn);
}

console.log(`${APPLY ? "APPLYING" : "DRY RUN"} -- insert Profit column on "${TAB}"`);
console.log(`  data rows: ${dataRows.length}  (first ${dataRows[0]}, last ${dataRows[dataRows.length - 1]})`);
console.log(`  daily-total rows: ${totalRows.length}`);
for (const t of totalRows) console.log(`    row ${t.rowNum}: profit ${t.sumFormula}`);

if (!APPLY) {
  console.log("\nNo changes written. Re-run with --apply to insert the Profit column.");
  process.exit(0);
}

// 1) Insert the new column at index 5 (between Part Cost=E and Date=F).
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { requests: [
    { insertDimension: { range: { sheetId: sid, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, inheritFromBefore: true } },
  ] },
});

// 2) Write Profit header + per-row Profit formulas + move daily totals into F; clear Labor on total rows.
const data = [];
data.push({ range: `${Q}!F1`, values: [["Profit"]] });
for (const rn of dataRows) data.push({ range: `${Q}!F${rn}`, values: [[`=IF(C${rn}="","",C${rn}-N(E${rn}))`]] });
for (const t of totalRows) {
  data.push({ range: `${Q}!F${t.rowNum}`, values: [[t.sumFormula]] }); // day profit -> Profit column
  data.push({ range: `${Q}!D${t.rowNum}`, values: [[""]] });           // clear Labor on total rows
}
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data } });

// 3) Formatting.
const reqs = [];
// header F1 bold
reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat" } });
// Profit data rows currency
reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 1, endRowIndex: 200, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } }, fields: "userEnteredFormat.numberFormat" } });
// total rows: copy the bold/yellow format from Labor(D) onto Profit(F), then clear Labor(D)'s highlight
for (const t of totalRows) {
  const r0 = t.rowNum - 1;
  reqs.push({ copyPaste: {
    source: { sheetId: sid, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: 3, endColumnIndex: 4 },
    destination: { sheetId: sid, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: 5, endColumnIndex: 6 },
    pasteType: "PASTE_FORMAT",
  } });
  reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { bold: false } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } });
}
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

console.log("\nDone. New layout: C Amount Paid | D Labor | E Part Cost | F Profit | G Date | H Type | I Tip | J Notes | K Inv Item");
console.log("Next: re-paste the updated Apps Script (Inv Item col 10->11, Date col 6->7), then rerun summary-tab.mjs.");
