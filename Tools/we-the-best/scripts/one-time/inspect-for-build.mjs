import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title,index,gridProperties)" });
console.log("=== TABS ===");
for (const s of meta.data.sheets) {
  const p = s.properties;
  console.log(`[${p.index}] "${p.title}"  id=${p.sheetId}  ${p.gridProperties.rowCount}x${p.gridProperties.columnCount}`);
}

async function head(title, range) {
  try {
    const v = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range })).data.values || [];
    console.log(`\n=== ${title} (first rows of ${range}) ===`);
    v.slice(0, 6).forEach((r, i) => console.log(`  r${i + 1}: ${JSON.stringify(r)}`));
  } catch (e) { console.log(`  (could not read ${range}: ${e.message})`); }
}

await head("Tire Inventory", "'Tire Inventory'!A1:H8");
await head("Jun 13+ header", "'Transactions (Jun 13+)'!A1:I3");
await head("Older header", "'Transactions (older)'!A1:N3");
