import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const TAB = "Transactions (Jun 13+)";
const Q = `'${TAB}'`;
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${Q}!A1:I200` })).data.values || [];
const isBlank = (r) => !r || r.every((c) => !String(c).trim());
const isTotal = (r) => /^total made/i.test((r && r[0]) || "");

const data = [];
for (let i = 1; i < rows.length; i++) {
  if (!isTotal(rows[i])) continue;
  const totalRowNum = i + 1;
  // walk up to find this day's contiguous transaction block
  let e = i - 1;
  let s = e;
  while (s - 1 >= 1 && !isBlank(rows[s - 1]) && !isTotal(rows[s - 1])) s--;
  const startRow = s + 1, endRow = e + 1; // 1-based
  const formula = `=SUM(C${startRow}:C${endRow})-SUM(E${startRow}:E${endRow})`;
  data.push({ range: `${Q}!D${totalRowNum}`, values: [[formula]] });
  console.log(`${(rows[i][0])}  -> D${totalRowNum} = ${formula}`);
}
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data } });
console.log(`\nConverted ${data.length} daily totals to live formulas.`);
