import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const PARTS = "Parts Inventory";
const SIZES = ["195-55-15","195-60-15","195-65-15","205-65-15","205-55-16","205-60-16","205-65-16","215-55-16","215-60-16","235-70-16","215-45-17","215-55-17","225-45-17","225-60-17","225-65-17","235-45-17","235-60-17","235-65-17","225-40-18","225-45-18","225-55-18","235-40-18","235-45-18","245-45-18","235-40-19"];
const LASTNEW = 41; // last tire entry row (TOTAL is at 42)

const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" });
const find = (t) => meta.data.sheets.find((s) => s.properties.title === t).properties;
const parts = find(PARTS), jun = find("Transactions (Jun 13+)"), tire = find("Tire Inventory");

// locate the catalog helper column by its header text (row 2), so we never hard-code the wrong column
const hdr = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${PARTS}'!A2:Z2` })).data.values?.[0] || [];
const catIdx0 = hdr.findIndex((h) => /catalog/i.test(h || ""));
if (catIdx0 < 0) { console.error("Catalog column not found — aborting."); process.exit(1); }
const catA1 = String.fromCharCode(65 + catIdx0); // e.g. "G"
console.log(`Catalog helper is column ${catA1}.`);

// 1) widen the catalog formula to the new tire rows; exclude blanks and the TOTAL cell
const catalog = `=VSTACK(IFERROR(FILTER('${PARTS}'!B3:B302,'${PARTS}'!B3:B302<>""),),IFERROR(FILTER('Tire Inventory'!B2:B${LASTNEW},('Tire Inventory'!B2:B${LASTNEW}<>"")*('Tire Inventory'!B2:B${LASTNEW}<>"TOTAL")),))`;
await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `'${PARTS}'!${catA1}3`, valueInputOption: "USER_ENTERED", requestBody: { values: [[catalog]] } });

// 2) hide the catalog column; 3) re-point the Jun dropdown at it; 4) Tire Size dropdown w/ free-type
const reqs = [
  { updateDimensionProperties: { range: { sheetId: parts.sheetId, dimension: "COLUMNS", startIndex: catIdx0, endIndex: catIdx0 + 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
  { setDataValidation: { range: { sheetId: jun.sheetId, startRowIndex: 1, endRowIndex: 400, startColumnIndex: 9, endColumnIndex: 10 }, rule: { condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: `='${PARTS}'!${catA1}3:${catA1}400` }] }, showCustomUi: true, strict: false } } },
  { setDataValidation: { range: { sheetId: tire.sheetId, startRowIndex: 1, endRowIndex: LASTNEW, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: "ONE_OF_LIST", values: SIZES.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } },
];
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

console.log(`Done: catalog widened to Tire B2:B${LASTNEW} (col ${catA1}, hidden), Jun dropdown re-pointed, Tire Size dropdown on B2:B${LASTNEW}.`);
