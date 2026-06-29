import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const PARTS = "Parts Inventory";
const SIZES = ["195-55-15","195-60-15","195-65-15","205-65-15","205-55-16","205-60-16","205-65-16","215-55-16","215-60-16","235-70-16","215-45-17","215-55-17","225-45-17","225-60-17","225-65-17","235-45-17","235-60-17","235-65-17","225-40-18","225-45-18","225-55-18","235-40-18","235-45-18","245-45-18","235-40-19"];
const LASTNEW = 41;

const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" });
const tireId = meta.data.sheets.find((s) => s.properties.title === "Tire Inventory").properties.sheetId;
const catA1 = "G"; // catalog helper column on Parts Inventory

// 1) delete Qty Stocked (col A) -> Tire Size becomes A, Qty Left becomes B
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ deleteDimension: { range: { sheetId: tireId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 } } }] } });

// 2) rename the kept count column; clear the now-broken entry-row formulas; widen catalog to Tire col A
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { valueInputOption: "USER_ENTERED", data: [
    { range: `'Tire Inventory'!B1`, values: [["Qty on Hand"]] },
    { range: `'${PARTS}'!${catA1}3`, values: [[`=VSTACK(IFERROR(FILTER('${PARTS}'!B3:B302,'${PARTS}'!B3:B302<>""),),IFERROR(FILTER('Tire Inventory'!A2:A${LASTNEW},('Tire Inventory'!A2:A${LASTNEW}<>"")*('Tire Inventory'!A2:A${LASTNEW}<>"TOTAL")),))`]] },
  ] },
});
await sheets.spreadsheets.values.batchClear({ spreadsheetId: SHEET_ID, requestBody: { ranges: [`'Tire Inventory'!B27:B${LASTNEW}`] } }); // remove =IF(A..) formulas that referenced deleted Qty Stocked

// 3) re-apply Tire Size dropdown on the new column A (free-type allowed)
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { requests: [
    { setDataValidation: { range: { sheetId: tireId, startRowIndex: 1, endRowIndex: LASTNEW, startColumnIndex: 0, endColumnIndex: 1 }, rule: { condition: { type: "ONE_OF_LIST", values: SIZES.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } },
  ] },
});

const v = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "'Tire Inventory'!A1:B7" })).data.values || [];
console.log("Tire Inventory now:"); v.forEach((r, i) => console.log("  r" + (i + 1) + ":", JSON.stringify(r)));
const cat = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${PARTS}'!G3:G40` })).data.values || [];
console.log("Catalog still lists", cat.flat().filter(Boolean).length, "tire sizes.");
