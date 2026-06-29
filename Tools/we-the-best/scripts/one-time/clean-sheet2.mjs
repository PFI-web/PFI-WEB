import { google } from "googleapis";
import { readFileSync } from "fs";

const DRY = !process.argv.includes("--write");
const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const SRC_TAB = "Sheet2";

const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const titleCase = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const signedNum = (s) => { const m = String(s).match(/-?\$?\s*[\d,]+(?:\.\d+)?/); return m ? parseFloat(m[0].replace(/[$,\s]/g, "")) : null; };
const firstNum = (s) => { const m = String(s).match(/[\d,]+(?:\.\d+)?/); return m ? parseFloat(m[0].replace(/[,]/g, "")) : null; };

function normPay(raw) {
  const t = (raw || "").trim().toLowerCase();
  if (!t) return "";
  if (/credit|card/.test(t)) return "Card reader";
  if (/zelle|selle/.test(t)) return "Zelle";
  if (/cash/.test(t)) return "Cash";
  if (/n\/?a/.test(t)) return "N/A";
  return titleCase(t);
}
function normDate(raw) {
  const m = String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return "";
  return `${+m[1]}/${+m[2]}/26`;
}
// translate Spanish + fix common typos in free text
function cleanText(s) {
  return String(s)
    .replace(/\bbreake?\b/gi, "brake").replace(/\buse tire\b/gi, "used tire").replace(/\buse\b/gi, "used")
    .replace(/\bselle\b/gi, "zelle").replace(/\bmontura\b/gi, "mounting").replace(/\btuberia\b/gi, "piping")
    .replace(/\bgusanillo\b/gi, "valve stem").replace(/\bdeposito\b/gi, "deposit").replace(/\bganacia\b/gi, "profit")
    .replace(/\bganancia\b/gi, "profit").replace(/\bcliente?\s*pago\b/gi, "client paid").replace(/\bpago\b/gi, "paid")
    .replace(/\bel otro mechanic\b/gi, "other mechanic").replace(/\bmecanico\b/gi, "mechanic")
    .replace(/\bamigo de\b/gi, "friend of").replace(/\boxygen\b/gi, "oil").replace(/\s+/g, " ").trim();
}
function normType(rawType, product, amtNum, isExpenseDesc) {
  const t = (rawType || "").trim().toLowerCase();
  if (amtNum != null && amtNum < 0) return "Expense";
  if (isExpenseDesc) return "Expense";
  if (/inspector/.test(t)) return "Inspector";
  if (/mechanic/.test(t)) return "Mechanic";
  // derive from product
  if (/inspection|registration/i.test(product)) return "Inspector";
  return "Mechanic";
}

const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SRC_TAB}!A1:G200` });
const all = res.data.values || [];
const header = ["Product", "Payment Method", "Amount Paid", "Part Cost", "Date", "Type", "Notes", "Tip"];
const out = [header];
const flagRows = [];
const samples = [];

for (let i = 1; i < all.length; i++) {
  const row = all[i] || [];
  const A = (row[0] || "").trim(), B = (row[1] || "").trim(), C = (row[2] || "").trim(),
        D = (row[3] || "").trim(), E = (row[4] || "").trim(), F = (row[5] || "").trim(), G = (row[6] || "").trim();
  const allEmpty = !A && !B && !C && !D && !E && !F && !G;
  if (allEmpty) { out.push([]); continue; }
  // daily subtotal row: only an amount, no product/payment/date
  if (!A && !B && !D && C) { out.push([]); continue; }

  const flags = [];
  const notes = [];
  let tip = "";
  let amtNum = signedNum(C);
  let amountPaid = null, partCost = null;

  const lowA = A.toLowerCase(), lowE = E.toLowerCase(), lowF = F.toLowerCase();
  const isPartsExpense = /parts?\s*expense/i.test(A);
  const isExpenseDesc = /\bexpense\b|berger/i.test(A) || /the shop|azul|andres/i.test(lowE);

  // ----- money -----
  if (amtNum != null && amtNum < 0) {
    partCost = -amtNum;
    notes.push(cleanText(`${A.replace(/expense:?/i, "").trim()} ${E} ${F}`));
    flags.push("expense");
  } else if (isPartsExpense) {
    const paid = firstNum(A.replace(/parts?\s*expense:?/i, "")); // "paid $96"
    partCost = paid;
    amountPaid = amtNum;
    if (F) notes.push(cleanText(F));
    if (E) notes.push(cleanText(E));
    // sanity: amountPaid - partCost should match any stated profit
    flags.push("parts");
  } else {
    amountPaid = amtNum;
  }

  // ----- product -----
  let product;
  if (amtNum != null && amtNum < 0 || /^expense:?/i.test(A)) {
    product = titleCase(cleanText(A.replace(/expense:?/i, "").replace(/\$[\d.,]+/g, "").trim())) || "Expense";
  } else {
    product = titleCase(cleanText(A.replace(/parts?\s*expense:?\s*paid\s*\$?[\d.]+/i, "Parts expense").replace(/\d{3}-\d{2}-\d{2,}/g, "").trim()));
  }
  if (!product && partCost != null) product = "Expense";

  // oil-change $30 oil cost (matches Sheet1 rule)
  if (/oil change/i.test(product) && amountPaid === 80) partCost = (partCost || 0) + 30;
  if (/oil change/i.test(product) && /\+|&|brake|tire|part|antifreeze/i.test(product) && partCost == null) partCost = 30;

  // ----- tips & extra notes (col F) -----
  if (/tip/i.test(F)) { const tn = firstNum(F); const who = F.replace(/[\d$.]/g, "").replace(/tip/i, "").trim(); tip = tn ? `$${tn}${who ? " " + titleCase(cleanText(who)) : ""}` : cleanText(F); }
  else if (F && !notes.join(" ").includes(cleanText(F))) notes.push(cleanText(F));
  if (/key\s*change|registration/i.test(lowF)) flags.push("check");

  const type = normType(E, product, amtNum, isExpenseDesc);

  // additional flags
  if (/total|deposit|\? number|berger|azul|oxygen|muffler|catalytic/i.test(`${A} ${E} ${F}`)) flags.push("review");
  if (amountPaid == null && partCost == null) flags.push("nomoney");

  const noteStr = [...new Set(notes.filter(Boolean))].join("; ");
  const newRow = [product, normPay(B), amountPaid, partCost, normDate(D), type, noteStr, tip];
  out.push(newRow);
  if (flags.length) flagRows.push(out.length - 1);
  samples.push({ i, raw: [A, B, C, D, E, F], "->": newRow, flags });
}

console.log("DRY:", DRY, "| src rows:", all.length, "| out rows:", out.length, "| flagged:", flagRows.length);
for (const s of samples) {
  console.log(`r${s.i} RAW  `, JSON.stringify(s.raw));
  console.log(`     CLEAN`, JSON.stringify(s["->"]), s.flags.length ? "  ⚑ " + s.flags.join(",") : "");
}

if (!DRY) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" });
  const src = meta.data.sheets.find((s) => s.properties.title === SRC_TAB);
  const backup = meta.data.sheets.find((s) => s.properties.title === "Sheet2 RAW (backup)");
  const reqs = [];
  if (backup) reqs.push({ deleteSheet: { sheetId: backup.properties.sheetId } });
  reqs.push({ duplicateSheet: { sourceSheetId: src.properties.sheetId, newSheetName: "Sheet2 RAW (backup)" } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });

  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: SRC_TAB });
  await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${SRC_TAB}!A1`, valueInputOption: "USER_ENTERED", requestBody: { values: out.map((r) => r.map((c) => (c == null ? "" : c))) } });

  const sid = src.properties.sheetId;
  const fmt = [
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 4 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } }, fields: "userEnteredFormat.numberFormat" } },
  ];
  for (const r of flagRows) fmt.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.98, green: 0.8, blue: 0.8 } } }, fields: "userEnteredFormat.backgroundColor" } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: fmt } });
  console.log(`\nWROTE cleaned Sheet2 (${out.length} rows), backup at "Sheet2 RAW (backup)", flagged ${flagRows.length}.`);
}
