// Fill oil Part Cost = $12 on PURE oil-change rows with Amount Paid >= $80.
// Owner-authorized (2026-06-29): $12 is the true bulk-oil cost per change; this OVERWRITES
// the hand-entered $30 oil costs on $80 oil changes and fills the blank ones.
// Scope: ONLY the "Transactions (Jun 13+)" tab; product is "Oil" or "Oil change" exactly
//        ("Oil" == "Oil change"); no bundled "+"/"&" jobs; amount >= 80.
// Dry-run by default; pass --apply to write.
import { google } from "googleapis";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const OIL_COST = 12;
const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const num = (s) => { const m = String(s ?? "").match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };
const isPureOil = (p) => /^oil(\s*change)?$/i.test(String(p ?? "").trim()); // "Oil" == "Oil change"

const data = [];      // value updates to batch
const report = [];    // {tab,row,prod,amt,oldCost,action}

// ---- Jun 13+ : Part Cost = col D ----
{
  const TAB = "Transactions (Jun 13+)";
  const v = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${TAB}'!A1:J200` })).data.values || [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i] || [];
    if (!isPureOil(r[0])) continue;
    const amt = num(r[2]);
    if (amt == null || amt < 80) continue;
    const oldCost = r[3];
    const rn = i + 1;
    report.push({ tab: TAB, row: rn, prod: r[0], amt, oldCost: oldCost ?? "", action: (oldCost ?? "") === "" ? "fill" : "overwrite" });
    data.push({ range: `'${TAB}'!D${rn}`, values: [[OIL_COST]] });
  }
}

// ---- report ----
let fills = 0, overwrites = 0, profitDelta = 0;
console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — set Part Cost = $${OIL_COST} on ${report.length} pure oil-change rows (amount >= $80)\n`);
for (const x of report) {
  const old = x.oldCost === "" ? null : num(x.oldCost);
  // profit change = -(newCost - oldCost) = oldCost - newCost
  profitDelta += (old ?? 0) - OIL_COST;
  if (x.action === "fill") fills++; else overwrites++;
  console.log(`  ${x.tab.padEnd(24)} row ${String(x.row).padStart(4)}  ${x.prod.padEnd(12)} $${String(x.amt).padStart(3)}  cost [${String(x.oldCost).padStart(6)}] -> $${OIL_COST}   (${x.action})`);
}
console.log(`\n  Fills (blank -> $12): ${fills}   Overwrites ($30 -> $12): ${overwrites}   Total: ${report.length}`);
console.log(`  Net effect on recorded profit: ${profitDelta >= 0 ? "+" : ""}$${Math.round(profitDelta * 100) / 100}`);

if (!APPLY) { console.log(`\n  (dry run — nothing written. Re-run with --apply to write.)`); process.exit(0); }

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data } });
console.log(`\n  Wrote ${data.length} cells. Now rerun summary-tab.mjs to reconcile.`);
