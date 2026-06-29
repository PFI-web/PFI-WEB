/**
 * Remove the Labor column (D) from "Transactions (Jun 13+)".
 * Labor always equaled Profit (parts pass through at cost), so it was redundant.
 *
 * BEFORE: C Amount Paid | D Labor | E Part Cost | F Profit | G Date | H Type | I Tip | J Notes | K Inv Item
 * AFTER:  C Amount Paid | D Part Cost | E Profit | F Date | G Type | H Tip | I Notes | J Inv Item
 *
 * Deleting the column makes Sheets auto-adjust every formula reference
 * (Profit =IF(C="","",C-N(E)) becomes =IF(C="","",C-N(D)); daily totals SUM(..E..) -> SUM(..D..)).
 * Owner numbers are untouched. Dry-run by default; pass --apply to delete.
 */
import { google } from "googleapis";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const TAB = "Transactions (Jun 13+)";
const Q = `'${TAB}'`;
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const sid = (await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" })).data.sheets.find((s) => s.properties.title === TAB).properties.sheetId;
const head = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${Q}!A1:K1` })).data.values?.[0] || [];
console.log(`${APPLY ? "APPLYING" : "DRY RUN"} on "${TAB}"`);
console.log("  current header:", head.map((v, i) => `${String.fromCharCode(65 + i)}=${v}`).join(" | "));

if (!APPLY) { console.log("\nWould delete column D (Labor). Re-run with --apply."); process.exit(0); }

await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { requests: [{ deleteDimension: { range: { sheetId: sid, dimension: "COLUMNS", startIndex: 3, endIndex: 4 } } }] },
});

const newHead = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${Q}!A1:J1` })).data.values?.[0] || [];
const fo = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${Q}!A19:J19`, valueRenderOption: "FORMULA" })).data.values?.[0] || [];
console.log("  new header:    ", newHead.map((v, i) => `${String.fromCharCode(65 + i)}=${v}`).join(" | "));
console.log(`  sample r19 Profit (E) formula: ${fo[4] || ""}`);
console.log("\nDone. Next: re-paste the updated Apps Script (Part Cost D, Profit E, Date F, Type G, Inv Item J).");
