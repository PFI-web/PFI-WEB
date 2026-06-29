import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const PARTS = "Parts Inventory";
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title,gridProperties)" });
const find = (t) => meta.data.sheets.find((s) => s.properties.title === t).properties;
const parts = find(PARTS), jun = find("Transactions (Jun 13+)"), tire = find("Tire Inventory");

// 1) make sure Parts Inventory has a column H for the hidden combined catalog
if (parts.gridProperties.columnCount < 8) {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ appendDimension: { sheetId: parts.sheetId, dimension: "COLUMNS", length: 8 - parts.gridProperties.columnCount } }] } });
}

// 2) combined catalog (part names + tire sizes) in hidden H3
const catalog = `=VSTACK(IFERROR(FILTER('${PARTS}'!B3:B302,'${PARTS}'!B3:B302<>""),),IFERROR(FILTER('Tire Inventory'!B2:B26,'Tire Inventory'!B2:B26<>""),))`;
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID, range: `'${PARTS}'!H2`, valueInputOption: "USER_ENTERED",
  requestBody: { values: [["Catalog (parts + tires)"], [catalog]] },
});

// 3) repoint the Inv Item dropdown to the combined catalog; hide helper col; flag the 3 off tire rows
const flags = [
  { row0: 5, note: "Sold shows '$4.00' (a $ sign in a count column). Qty Left 2 from 8 stocked implies ~6 sold — please verify the count." },        // 205-55-16
  { row0: 14, note: "8 stocked − 4 sold = 4, but Qty Left shows 0. Please verify the remaining count." },                                            // 225-60-17
  { row0: 17, note: "4 sold and $268 sale total, but Qty Left is blank. Please fill in the remaining count." },                                      // 235-60-17
];
const reqs = [
  // dropdown now sources parts + tires
  { setDataValidation: { range: { sheetId: jun.sheetId, startRowIndex: 1, endRowIndex: 400, startColumnIndex: 9, endColumnIndex: 10 }, rule: { condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: `='${PARTS}'!H3:H400` }] }, showCustomUi: true, strict: false } } },
  // hide the helper column H
  { updateDimensionProperties: { range: { sheetId: parts.sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
  // red highlight on Sold (C, idx2) + Qty Left (G, idx6) of the off rows
  ...flags.flatMap((f) => [
    { repeatCell: { range: { sheetId: tire.sheetId, startRowIndex: f.row0, endRowIndex: f.row0 + 1, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.98, green: 0.8, blue: 0.8 } } }, fields: "userEnteredFormat.backgroundColor" } },
    { repeatCell: { range: { sheetId: tire.sheetId, startRowIndex: f.row0, endRowIndex: f.row0 + 1, startColumnIndex: 6, endColumnIndex: 7 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.98, green: 0.8, blue: 0.8 } } }, fields: "userEnteredFormat.backgroundColor" } },
    // attach an explanatory note to the Qty Left cell WITHOUT changing its value
    { updateCells: { range: { sheetId: tire.sheetId, startRowIndex: f.row0, endRowIndex: f.row0 + 1, startColumnIndex: 6, endColumnIndex: 7 }, rows: [{ values: [{ note: f.note }] }], fields: "note" } },
  ]),
];
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

console.log("Step 3 sheet-side done: combined catalog (hidden H), dropdown repointed to parts+tires, 3 off tire rows flagged (values untouched).");
