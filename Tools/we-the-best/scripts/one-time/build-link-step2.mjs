import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const JUN = "Transactions (Jun 13+)";
const PARTS = "Parts Inventory";
const FIRST = 3, LAST = 302;

const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title,gridProperties)" });
const find = (t) => meta.data.sheets.find((s) => s.properties.title === t).properties;
const jun = find(JUN), parts = find(PARTS);

// 1) make sure Jun 13+ has a column J, and Parts has a column F
const grow = [];
if (jun.gridProperties.columnCount < 10) grow.push({ appendDimension: { sheetId: jun.sheetId, dimension: "COLUMNS", length: 10 - jun.gridProperties.columnCount } });
if (parts.gridProperties.columnCount < 6) grow.push({ appendDimension: { sheetId: parts.sheetId, dimension: "COLUMNS", length: 6 - parts.gridProperties.columnCount } });
if (grow.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: grow } });

// 2) headers + upgraded Status formula (Parts col E reads new Sold On col F)
const statusCol = [];
for (let r = FIRST; r <= LAST; r++) statusCol.push([`=IF(B${r}="","",IF(F${r}<>"","Sold","In stock"))`]);
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: {
    valueInputOption: "USER_ENTERED",
    data: [
      { range: `'${JUN}'!J1`, values: [["Inv Item"]] },
      { range: `'${PARTS}'!F2`, values: [["Sold On"]] },
      { range: `'${PARTS}'!E${FIRST}:E${LAST}`, values: statusCol },
    ],
  },
});

// 3) Inv Item dropdown on Jun 13+ (J2:J400), sourced from Parts Inventory names, free-type allowed
const reqs = [
  { setDataValidation: { range: { sheetId: jun.sheetId, startRowIndex: 1, endRowIndex: 400, startColumnIndex: 9, endColumnIndex: 10 }, rule: { condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: `='${PARTS}'!B${FIRST}:B${LAST}` }] }, showCustomUi: true, strict: false } } },
  // header styling to match
  { repeatCell: { range: { sheetId: jun.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 9, endColumnIndex: 10 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
  { repeatCell: { range: { sheetId: parts.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
  { autoResizeDimensions: { dimensions: { sheetId: jun.sheetId, dimension: "COLUMNS", startIndex: 9, endIndex: 10 } } },
  { autoResizeDimensions: { dimensions: { sheetId: parts.sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 } } },
];
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

console.log("Step 2 sheet-side done: Inv Item dropdown on Jun 13+, Sold On col + Status upgrade on Parts Inventory.");
