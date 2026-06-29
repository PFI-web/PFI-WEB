import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const PARTS = "Parts Inventory";
const SIZES = ["195-55-15","195-60-15","195-65-15","205-65-15","205-55-16","205-60-16","205-65-16","215-55-16","215-60-16","235-70-16","215-45-17","215-55-17","225-45-17","225-60-17","225-65-17","235-45-17","235-60-17","235-65-17","225-40-18","225-45-18","225-55-18","235-40-18","235-45-18","245-45-18","235-40-19"];

const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" });
const tireId = meta.data.sheets.find((s) => s.properties.title === "Tire Inventory").properties.sheetId;

// confirm TOTAL is at row 27 before inserting
const col = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "'Tire Inventory'!B1:B40" })).data.values || [];
const totalIdx0 = col.findIndex((r) => (r[0] || "").toString().trim().toUpperCase() === "TOTAL");
if (totalIdx0 < 0) { console.error("Could not find TOTAL row — aborting."); process.exit(1); }
const totalRow = totalIdx0 + 1; // 1-based (expect 27)

// 1) insert 15 blank entry rows just ABOVE the TOTAL row
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { requests: [{ insertDimension: { range: { sheetId: tireId, dimension: "ROWS", startIndex: totalRow - 1, endIndex: totalRow - 1 + 15 }, inheritFromBefore: true } }] },
});
const firstNew = totalRow;        // first inserted row (1-based)
const lastNew = totalRow + 14;    // last inserted row

// 2) Qty Left auto-formula on the new blank rows only (existing typed Qty Left untouched)
const qtyLeft = [];
for (let r = firstNew; r <= lastNew; r++) qtyLeft.push([`=IF(A${r}="","",A${r})`]);
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID, range: `'Tire Inventory'!D${firstNew}:D${lastNew}`, valueInputOption: "USER_ENTERED",
  requestBody: { values: qtyLeft },
});

// 3) widen the hidden catalog so newly-added tire sizes flow into the Jun 13+ dropdown
const catalog = `=VSTACK(IFERROR(FILTER('${PARTS}'!B3:B302,'${PARTS}'!B3:B302<>""),),IFERROR(FILTER('Tire Inventory'!B2:B${lastNew},('Tire Inventory'!B2:B${lastNew}<>"")*('Tire Inventory'!B2:B${lastNew}<>"TOTAL")),))`;
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID, range: `'${PARTS}'!H3`, valueInputOption: "USER_ENTERED", requestBody: { values: [[catalog]] },
});

// 4) Tire Size dropdown on B2:B<lastNew>, seeded with current sizes, free-type allowed
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { requests: [
    { setDataValidation: { range: { sheetId: tireId, startRowIndex: 1, endRowIndex: lastNew, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: "ONE_OF_LIST", values: SIZES.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } },
  ] },
});

console.log(`Tires made easy: inserted rows ${firstNew}-${lastNew} above TOTAL (now row ${lastNew + 1}); size dropdown on B2:B${lastNew}; Qty Left auto-formula on new rows; catalog widened to B2:B${lastNew}.`);
