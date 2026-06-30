import { google } from "googleapis";
import { readFileSync } from "fs";

const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const OUT_TAB = "Summary";
const sa = JSON.parse(readFileSync("../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const money = (s) => { if (!s && s !== 0) return 0; const neg = /-/.test(String(s)); const m = String(s).match(/[\d.]+/); const v = m ? parseFloat(m[0]) : 0; return neg ? -v : v; }; // handles "-$30" expenses
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function parseMonth(d) {
  const m = String(d).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let yr = parseInt(m[3], 10); if (yr < 100) yr += 2000;
  const mo = parseInt(m[1], 10);
  if (mo < 1 || mo > 12) return null;
  return { key: yr * 100 + mo, label: `${MON[mo - 1]} ${yr}` };
}

// read each tab by header name so column reordering never breaks the math
async function loadTab(range) {
  const v = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range })).data.values || [];
  if (!v.length) return [];
  const head = v[0].map((h) => (h || "").toString().trim().toLowerCase());
  const at = (name) => head.indexOf(name);
  const ci = { amt: at("amount paid"), cost: at("part cost"), date: at("date"), type: at("type") };
  return v.slice(1).map((row) => [row[ci.date], row[ci.amt], row[ci.cost], row[ci.type]]); // -> [date, amt, cost, type]
}
const rows = [
  ...(await loadTab("'Transactions (older)'!A1:N1599")),
  ...(await loadTab("'Transactions (Jun 13+)'!A1:J200")),
];

const TYPES = ["Mechanic", "Inspector", "Expense"];
const byType = Object.fromEntries(TYPES.map((t) => [t, { rev: 0, cost: 0, profit: 0, n: 0 }]));
const months = new Map(); // key -> {label, p:{type:val}, inspN}
let undated = 0;

// Inspection sticker cost per month: $1,205 before June 2026, $1,810 from June 2026 on.
const stickerRate = (key) => (key < 202606 ? 1205 : 1810);

for (const row of rows) {
  const type = (row[3] || "").trim(); // [date, amt, cost, type]
  if (!TYPES.includes(type)) continue;
  const rev = money(row[1]); // Amount Paid
  const cost = money(row[2]); // Part Cost
  const profit = rev - cost;
  byType[type].rev += rev; byType[type].cost += cost; byType[type].profit += profit; byType[type].n++;

  const pm = parseMonth(row[0]);
  if (!pm) { undated++; continue; }
  if (!months.has(pm.key)) months.set(pm.key, { key: pm.key, label: pm.label, p: { Mechanic: 0, Inspector: 0, Expense: 0 }, inspN: 0 });
  const mo = months.get(pm.key);
  mo.p[type] += profit;
  if (type === "Inspector") mo.inspN++;
}

const sortedMonths = [...months.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
// sticker cost applies only to months that actually had inspections
for (const m of sortedMonths) m.sticker = m.inspN > 0 ? stickerRate(m.key) : 0;
const totalSticker = sortedMonths.reduce((s, m) => s + m.sticker, 0);

// ---- Fixed monthly overhead (owner-provided 2026-06-29) ----
// Weekly pay normalized to monthly (× 52 ÷ 12, avg 4.33 wk/mo).
const OVERHEAD = [
  { name: "Tomas — pay", amount: 850, per: "week" },
  { name: "Ana — pay", amount: 900, per: "week" },
  { name: "Rent — building", amount: 3000, per: "month" },
  { name: "Electric (light)", amount: 350, per: "month" },
  { name: "Trash", amount: 140, per: "month" },
  { name: "Gas (UGI)", amount: 150, per: "month" },
  { name: "Internet", amount: 245, per: "month" },
  { name: "OPUS (machine)", amount: 250, per: "month" },
  { name: "Supplies (paper, toilet, etc.)", amount: 50, per: "month" },
  { name: "OBD (machine)", amount: 230, per: "month" },
  { name: "Westfield", amount: 90, per: "month" },
  { name: "MCIRS (software)", amount: 40, per: "month" },
];
const toMonthly = (e) => (e.per === "week" ? (e.amount * 52) / 12 : e.amount);
const r2c = (n) => Math.round(n * 100) / 100;
const monthlyOH = OVERHEAD.reduce((s, e) => s + toMonthly(e), 0);
// Owner: overhead "starts at Feb down" — applies from Feb 2026 onward to every real operating
// month (one with mechanic/inspector activity). Skips the lone Jan 2025, anything before Feb 2026,
// and the cost-only rollover months (Dec 2026 / Mar 2027, no mech/insp activity).
const OH_START = 202602;
const ohForMonth = (m) => (m.key >= OH_START && (m.p.Mechanic !== 0 || m.p.Inspector !== 0)) ? monthlyOH : 0;

// ---- Build sheet values ---- (track row indices for formatting)
const out = [];
const titleRows = [], headerRows = [], totalRows = [], currencyRanges = [];
const push = (row) => out.push(row);

titleRows.push(out.length);
push(["MONTHLY PROFIT BY TYPE (net of inspection stickers)"]);
headerRows.push(out.length);
push(["Month", "Mechanic", "Inspector", "Stickers", "Expense", "Net Profit", "Overhead", "Take-home"]);
const t1Start = out.length;
const t = { Mechanic: 0, Inspector: 0, Expense: 0, sticker: 0, oh: 0, take: 0 };
for (const m of sortedMonths) {
  const net = m.p.Mechanic + m.p.Inspector - m.sticker + m.p.Expense;
  const oh = ohForMonth(m);
  const take = net - oh;
  t.Mechanic += m.p.Mechanic; t.Inspector += m.p.Inspector; t.Expense += m.p.Expense; t.sticker += m.sticker; t.oh += oh; t.take += take;
  push([m.label, m.p.Mechanic, m.p.Inspector, m.sticker ? -m.sticker : 0, m.p.Expense, net, oh ? -oh : 0, r2c(take)]);
}
totalRows.push(out.length);
push(["TOTAL", t.Mechanic, t.Inspector, -t.sticker, t.Expense, t.Mechanic + t.Inspector - t.sticker + t.Expense, -t.oh, r2c(t.take)]);
currencyRanges.push({ r0: t1Start, r1: out.length, c0: 1, c1: 8 }); // cols B-H
push([]);
push([]);

titleRows.push(out.length);
push(["TOTALS BY TYPE"]);
headerRows.push(out.length);
push(["Type", "Revenue", "Cost", "Profit", "# Transactions"]);
const t2Start = out.length;
const t2 = { rev: 0, cost: 0, profit: 0, n: 0 };
for (const ty of TYPES) {
  const b = byType[ty];
  const cost = b.cost + (ty === "Inspector" ? totalSticker : 0); // stickers are the inspection cost
  const profit = b.rev - cost;
  t2.rev += b.rev; t2.cost += cost; t2.profit += profit; t2.n += b.n;
  push([ty, b.rev, cost, profit, b.n]);
}
totalRows.push(out.length);
push(["TOTAL", t2.rev, t2.cost, t2.profit, t2.n]);
currencyRanges.push({ r0: t2Start, r1: out.length, c0: 1, c1: 4 }); // Revenue/Cost/Profit
const inspNet = byType.Inspector.profit - totalSticker;
const grandNet = t2.profit;

// ---- Bottom line: take-home after fixed overhead (sits right under the TOTAL above) ----
const ohMonths = sortedMonths.filter((m) => ohForMonth(m) > 0);
const totalOH = ohMonths.length * monthlyOH;
const takeHome = t2.profit - totalOH;
push([]);
titleRows.push(out.length);
push(["BOTTOM LINE — TAKE-HOME AFTER OVERHEAD"]);
const t4Start = out.length;
push(["Net profit (all types)", r2c(t2.profit)]);
push([`Fixed overhead (${ohMonths.length} mo × $${Math.round(monthlyOH).toLocaleString()}/mo, Feb 2026 on)`, -r2c(totalOH)]);
totalRows.push(out.length);
push(["TAKE-HOME after expenses", r2c(takeHome)]);
currencyRanges.push({ r0: t4Start, r1: out.length, c0: 1, c1: 2 });

push([]);
push([`Note: Inspector cost = $${totalSticker.toLocaleString()} in inspection stickers (Nov 2025-May 2026 @ $1,205/mo, Jun 2026 @ $1,810/mo). Inspection jobs have no per-part cost.`]);
push([]);
push([]);

// ---- Monthly operating expenses (fixed overhead) — itemized detail ----
titleRows.push(out.length);
push(["MONTHLY OPERATING EXPENSES (fixed overhead)"]);
headerRows.push(out.length);
push(["Expense", "Amount", "Per", "Monthly cost"]);
const t3Start = out.length;
for (const e of OVERHEAD) {
  push([e.name, e.amount, e.per, r2c(toMonthly(e))]);
}
totalRows.push(out.length);
push(["TOTAL / month", "", "", r2c(monthlyOH)]);
currencyRanges.push({ r0: t3Start, r1: out.length, c0: 1, c1: 2 }); // Amount col (B)
currencyRanges.push({ r0: t3Start, r1: out.length, c0: 3, c1: 4 }); // Monthly cost col (D)
push([]);
push([`Note: weekly pay (Tomas, Ana) converted to monthly × 52 ÷ 12 (avg 4.33 weeks/mo). Fixed overhead ≈ $${Math.round(monthlyOH).toLocaleString()}/month (≈ $${Math.round(monthlyOH * 12).toLocaleString()}/year). Applied to operating months from Feb 2026 on (see the Overhead / Take-home columns and the bottom line above).`]);

// ---- Write tab ----
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title,index)" });
const existing = meta.data.sheets.find((s) => s.properties.title === OUT_TAB);
// keep Summary right after "Parts Inventory" instead of letting addSheet drop it at the end
const partsIdx = meta.data.sheets.find((s) => s.properties.title === "Parts Inventory")?.properties.index ?? meta.data.sheets.length - 1;
let targetIdx = partsIdx + 1;
if (existing && existing.properties.index <= partsIdx) targetIdx -= 1; // deleting an earlier Summary shifts indices down
const reqs = [];
if (existing) reqs.push({ deleteSheet: { sheetId: existing.properties.sheetId } });
reqs.push({ addSheet: { properties: { title: OUT_TAB, index: targetIdx, gridProperties: { columnCount: 8 } } } });
const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });
const sid = add.data.replies.find((x) => x.addSheet).addSheet.properties.sheetId;

await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID, range: `${OUT_TAB}!A1`, valueInputOption: "USER_ENTERED",
  requestBody: { values: out.map((row) => row.map((c) => (c == null ? "" : c))) },
});

const fmt = [
  ...titleRows.map((rr) => ({ repeatCell: { range: { sheetId: sid, startRowIndex: rr, endRowIndex: rr + 1, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } }, fields: "userEnteredFormat.textFormat" } })),
  ...headerRows.map((rr) => ({ repeatCell: { range: { sheetId: sid, startRowIndex: rr, endRowIndex: rr + 1, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } })),
  ...totalRows.map((rr) => ({ repeatCell: { range: { sheetId: sid, startRowIndex: rr, endRowIndex: rr + 1, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat" } })),
  ...currencyRanges.map((g) => ({ repeatCell: { range: { sheetId: sid, startRowIndex: g.r0, endRowIndex: g.r1, startColumnIndex: g.c0, endColumnIndex: g.c1 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0" } } }, fields: "userEnteredFormat.numberFormat" } })),
  { autoResizeDimensions: { dimensions: { sheetId: sid, dimension: "COLUMNS", startIndex: 0, endIndex: 8 } } },
];
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: fmt } });

const r2 = (n) => Math.round(n * 100) / 100;
console.log(`Wrote "${OUT_TAB}". Months: ${sortedMonths.length}, undated skipped: ${undated}`);
console.log(`Total inspection stickers deducted: $${totalSticker}`);
console.log(`Inspector profit gross $${byType.Inspector.profit} -> net $${r2(inspNet)}`);
console.log(`NET PROFIT (all types): $${r2(grandNet)}`);
console.log("Monthly (Mech / Insp / Stickers / Exp / Net):");
for (const m of sortedMonths) console.log(`  ${m.label}: $${m.p.Mechanic} / $${m.p.Inspector} / -$${m.sticker} / $${r2(m.p.Expense)} / $${r2(m.p.Mechanic + m.p.Inspector - m.sticker + m.p.Expense)}`);
