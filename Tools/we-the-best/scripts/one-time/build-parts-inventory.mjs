import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const TAB = "Parts Inventory";
const SEED = ["Brake Pads Front", "Brake Pads Rear", "Rotors", "Lights", "Sensor", "Suspension", "Belt"];
const NOTE = "Parts bought before June 13 are pre-paid stock — sales of old inventory through ~July will read high until it sells through.";
const FIRST = 3, LAST = 302; // data rows 3..302

const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

// don't clobber an existing tab
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" });
if (meta.data.sheets.some((s) => s.properties.title === TAB)) {
  console.error(`Tab "${TAB}" already exists — aborting so nothing is overwritten.`); process.exit(1);
}

// create the tab (placed after Tire Inventory)
const add = await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { requests: [{ addSheet: { properties: { title: TAB, index: 2, gridProperties: { rowCount: LAST + 50, columnCount: 5, frozenRowCount: 2 } } } }] },
});
const sid = add.data.replies[0].addSheet.properties.sheetId;

// values: banner, header, and the two formula columns (Part ID, Status); B/C/D left blank for the user
const idCol = [], stCol = [];
for (let r = FIRST; r <= LAST; r++) {
  idCol.push([`=IF(B${r}="","","P-"&TEXT(ROW()-2,"000"))`]);
  stCol.push([`=IF(B${r}="","","In stock")`]);
}
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: {
    valueInputOption: "USER_ENTERED",
    data: [
      { range: `'${TAB}'!A1`, values: [[NOTE]] },
      { range: `'${TAB}'!A2:E2`, values: [["Part ID", "Part Name", "Cost", "Date In", "Status"]] },
      { range: `'${TAB}'!A${FIRST}:A${LAST}`, values: idCol },
      { range: `'${TAB}'!E${FIRST}:E${LAST}`, values: stCol },
    ],
  },
});

// formatting + dropdown
const reqs = [
  // banner: merge A1:E1, bold, wrap, light-yellow
  { mergeCells: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 }, mergeType: "MERGE_ALL" } },
  { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 }, cell: { userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: "WRAP", backgroundColor: { red: 1, green: 0.97, blue: 0.8 } } }, fields: "userEnteredFormat(textFormat,wrapStrategy,backgroundColor)" } },
  // header row 2: bold + gray
  { repeatCell: { range: { sheetId: sid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 5 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
  // Cost column currency
  { repeatCell: { range: { sheetId: sid, startRowIndex: FIRST - 1, endRowIndex: LAST, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } }, fields: "userEnteredFormat.numberFormat" } },
  // Part Name dropdown: suggestions + free-type (strict:false = show warning, not reject)
  { setDataValidation: { range: { sheetId: sid, startRowIndex: FIRST - 1, endRowIndex: LAST, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: "ONE_OF_LIST", values: SEED.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } },
  { autoResizeDimensions: { dimensions: { sheetId: sid, dimension: "COLUMNS", startIndex: 0, endIndex: 5 } } },
];
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

console.log(`Built "${TAB}" (sheetId ${sid}). Seed parts: ${SEED.join(", ")}. Data rows ${FIRST}-${LAST}.`);
