import { google } from "googleapis";
import { readFileSync } from "fs";

const DRY = !process.argv.includes("--write");
const SHEET_ID = "1cqsJ0yI0__TGLWGrgijGMLj-Ri4PLsyZNgjGOG1VJI4";
const SRC_TAB = "Sheet1";
const OUT_TAB = "Sheet1 (cleaned)";

const sa = JSON.parse(readFileSync("../../../../thepfi-firebase-adminsdk-fbsvc-b6e34cc117.json", "utf8"));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

// ---------- helpers ----------
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// ---- PAYMENT ----
function mapPayToken(t) {
  t = t.trim().toLowerCase().replace(/[.\s]+$/, "");
  if (!t) return null;
  if (/cash.?app|cash-?app/.test(t)) return "Cash App";
  if (/card/.test(t)) return "Card reader";
  if (/zelle|selle/.test(t)) return "Zelle";
  if (/^n\/?a$|^na$/.test(t)) return "N/A";
  if (/ef|cash/.test(t)) return "Cash"; // efectivo and all its typos + cash
  return null; // unknown
}
function normPayment(raw) {
  const flags = [];
  const notes = [];
  let s = (raw ?? "").trim();
  if (!s) return { value: "", notes, flags, moveProduct: null };
  // a product word landed in the payment column
  if (/^oil change\s*$/i.test(s)) return { value: "", notes, flags: ["shift"], moveProduct: "Oil change" };
  // pull a parenthetical note out
  const pm = s.match(/\(([^)]*)\)/);
  if (pm) {
    if (/did ?n.?t pass|didnt pass/i.test(pm[1])) notes.push("Didn't pass");
    s = s.replace(/\([^)]*\)/g, " ").trim();
  }
  const order = ["Cash", "Card reader", "Zelle", "Cash App", "N/A"];
  const parts = s.split("+").map(mapPayToken);
  if (parts.some((p) => p === null)) flags.push("pay");
  const set = [...new Set(parts.filter(Boolean))];
  set.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { value: set.join(" + "), notes, flags, moveProduct: null };
}

// ---- PRODUCT ----
const PROD = new Map(Object.entries({
  "inspections": "Inspection", "inspection": "Inspection", "inpsections": "Inspection",
  "inpsection": "Inspection", "insepction": "Inspection", "inspectsions": "Inspection",
  "inspsection": "Inspection", "insepctions": "Inspection",
  "tires": "Tire", "tire": "Tire", "tries": "Tire", "used tire": "Used tire", "use tire": "Used tire",
  "tire plug": "Tire plug", "tires plug": "Tire plug", "tire pulg": "Tire plug", "tier plug": "Tire plug",
  "balance tires": "Tire balance", "tire balance": "Tire balance", "tires balance": "Tire balance",
  "tires balanace": "Tire balance", "tire air": "Tire air", "tire fix": "Tire fix", "tire sensor": "Tire sensor",
  "oil change": "Oil change", "oil": "Oil change", "oil chnage": "Oil change", "change oil": "Oil change",
  "oil chagne": "Oil change", "related to oil": "Oil change", "oil sensor": "Oil sensor",
  "breaks": "Brakes", "break": "Brakes", "break fix": "Brake fix",
  "lights": "Lights", "light": "Lights", "two lights": "Lights", "change the lights": "Lights", "fix a light": "Lights",
  "car check": "Car check", "check car": "Car check", "check the car": "Car check",
  "installation": "Installation", "installaion": "Installation", "instalation": "Installation",
  "instuallation": "Installation", "instilation": "Installation", "instailaion": "Installation",
  "instuallation": "Installation", "instuallation ": "Installation",
  "part change": "Part change", "change part": "Part change", "change a part": "Part change",
  "fix part": "Part change", "fix a part": "Part change", "a part": "Part", "part": "Part", "car part": "Part",
  "part instalation": "Part installation", "part installation": "Part installation",
  "sensor": "Sensor", "diagnosis": "Diagnosis", "unknown": "Unknown", "supension": "Suspension",
  "suspension": "Suspension", "supenision": "Suspension", "tapon": "Plug (tapon)", "plug": "Plug",
  "spark plug": "Spark plug", "belt": "Belt", "belt tensioner": "Belt tensioner",
  "windsheld wiper": "Windshield wiper", "fixed chair of car": "Car seat repair", "fixed car seat": "Car seat repair",
  "control arm installation": "Control arm installation", "sensor installation": "Sensor installation",
  "pump + other fix": "Pump + other", "parts expense:": "Parts expense", "n/a": "N/A",
}));
function combineTokens(s) {
  const order = (frag) => {
    frag = frag.trim().toLowerCase();
    if (/insp/.test(frag)) return "Inspection";
    if (/anti.?freeze/.test(frag)) return "Antifreeze";
    if (/oil/.test(frag)) return "Oil change";
    if (/break|brake/.test(frag)) return "Brakes";
    if (/plug/.test(frag)) return "Tire plug";
    if (/balance/.test(frag)) return "Tire balance";
    if (/tire/.test(frag)) return "Tire";
    if (/light/.test(frag)) return "Lights";
    if (/sensor/.test(frag)) return "Sensor";
    if (/install/.test(frag)) return "Installation";
    if (/bumper/.test(frag)) return "Bumper";
    if (/car check|check/.test(frag)) return "Car check";
    if (/pump/.test(frag)) return "Pump";
    if (/part/.test(frag)) return "Part";
    if (/other|fix/.test(frag)) return "Other";
    return titleCase(frag);
  };
  const parts = s.split(/\+|\band\b/).map(order);
  return [...new Set(parts.filter(Boolean))].join(" + ");
}
function normProduct(raw) {
  const flags = [];
  const notes = [];
  let s = (raw ?? "").trim();
  if (!s) return { value: "", notes, flags };
  // payment word landed in product column
  if (/^ef|^cash$|^zelle$/i.test(s)) return { value: "", notes: ["was '" + s + "' in product col"], flags: ["shift"] };
  // extract embedded detail e.g. "part change ( replace hose )"
  const pm = s.match(/\(([^)]*)\)/);
  if (pm && pm[1].trim()) notes.push(pm[1].trim());
  const base = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  let value;
  if (PROD.has(base)) value = PROD.get(base);
  else if (/\+|\band\b/.test(base)) value = combineTokens(base);
  else value = titleCase(base);
  if (/tapon|^unknown$/i.test(base)) flags.push("prod");
  return { value, notes, flags };
}

// ---- MONEY ----
function num(x) { return parseFloat(String(x).replace(/[, ]/g, "")); }
function normMoney(raw, isExpense) {
  const flags = [];
  const notes = [];
  let amountPaid = null, partCost = null;
  let s = (raw ?? "").trim();
  if (!s) return { amountPaid, partCost, notes, flags };
  const lower = s.toLowerCase();
  const nums = [...s.matchAll(/\$?\s*([\d,]+(?:\.\d{1,2})?)/g)].map((m) => num(m[1]));
  const clientPaid = /client paid|customer paid|client piad/.test(lower);
  const partCostNote = /part cost/.test(lower);
  const didntPass = /did ?n.?t pass|didnt pass/.test(lower);
  const bizExp = /business expense/.test(lower);
  const companyCar = /company car|in value/.test(lower);

  if (didntPass) notes.push("Didn't pass");
  if (companyCar) { notes.push("Company car (barter / in-kind value)"); flags.push("money"); }
  if (bizExp) { notes.push("Business expense"); flags.push("money"); }

  if (companyCar) {
    amountPaid = nums[0] ?? null;
  } else if (partCostNote) {
    amountPaid = nums[0] ?? null; partCost = nums[1] ?? null;
  } else if (clientPaid) {
    if (nums.length >= 2) { partCost = nums[0]; amountPaid = nums[1]; }
    else { amountPaid = nums[0] ?? null; }
  } else if (bizExp) {
    partCost = nums[0] ?? null;
  } else if (isExpense) {
    partCost = nums[0] ?? null;
    if (partCost != null) notes.push("Business purchase (not yet sold)");
  } else {
    amountPaid = nums[0] ?? null;
  }
  return { amountPaid, partCost, notes, flags };
}

// ---- TYPE ----
const MECH = /^(tire|used tire|tire plug|tire balance|tire air|tire fix|tire sensor|oil change|oil sensor|brakes|brake fix|lights|car check|installation|part|part change|part installation|sensor|diagnosis|suspension|plug|spark plug|belt|belt tensioner|windshield wiper|car seat repair|control arm installation|sensor installation|pump|bumper)/i;
function deriveType(origType, product) {
  if (/mecanico/i.test(origType || "")) return { value: "Mechanic", flag: false };
  if (/inspection/i.test(product)) return { value: "Inspection", flag: false };
  if (/parts expense/i.test(product)) return { value: "Expense", flag: false };
  if (MECH.test(product) || /\+/.test(product)) return { value: "Mechanic", flag: false };
  if (/^(unknown|n\/a|)$/i.test(product)) return { value: origType ? "Mechanic" : "", flag: !!product }; // ambiguous
  return { value: "Mechanic", flag: false };
}

// ---------- run ----------
const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SRC_TAB });
const all = res.data.values || [];
const header = ["Product", "Payment Method", "Amount Paid", "Part Cost", "Date", "Type", "Notes"];
const out = [header];
const flagRows = []; // 0-based index in `out`
const samples = [];

for (let i = 1; i < all.length; i++) {
  const row = all[i];
  const isBlank = !row || row.length === 0 || row.every((c) => !String(c).trim());
  if (isBlank) { out.push([]); continue; }
  // duplicate header row
  if (/^product/i.test((row[0] || "").trim())) { out.push([]); flagRows.push(out.length - 1); continue; }

  const rawProd = row[0] || "", rawPay = row[1] || "", rawAmt = row[2] || "", rawDate = row[3] || "", rawType = row[4] || "";
  const prod = normProduct(rawProd);
  const pay = normPayment(rawPay);
  if (pay.moveProduct && !prod.value) prod.value = pay.moveProduct;
  const isExpense = /parts expense/i.test(prod.value);
  const money = normMoney(rawAmt, isExpense);
  const type = deriveType(rawType, prod.value);

  const notes = [...prod.notes, ...pay.notes, ...money.notes].filter(Boolean);
  const flags = [...prod.flags, ...pay.flags, ...money.flags];
  if (type.flag) flags.push("type");
  // orphan: has product but no money and no date
  if (prod.value && money.amountPaid == null && money.partCost == null && !rawDate.trim()) flags.push("orphan");

  const newRow = [prod.value, pay.value, money.amountPaid, money.partCost, rawDate.trim(), type.value, notes.join("; ")];
  out.push(newRow);
  if (flags.length) flagRows.push(out.length - 1);

  const interesting = [62, 77, 153, 192, 213, 359, 360, 370, 371, 374, 624, 628, 1226];
  if (flags.length || interesting.includes(i)) {
    samples.push({ i, raw: [rawProd, rawPay, rawAmt, rawType], "->": newRow, flags });
  }
}

console.log("DRY RUN:", DRY, "| source rows:", all.length, "| output rows:", out.length, "| flagged:", flagRows.length);
console.log("\n=== SAMPLE TRANSFORMS (raw -> cleaned) ===");
for (const s of samples) {
  console.log(`row ${s.i}  RAW   `, JSON.stringify(s.raw));
  console.log(`         CLEAN `, JSON.stringify(s["->"]), s.flags.length ? "  ⚑ " + s.flags.join(",") : "");
}

if (!DRY) {
  // (re)create output tab
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(sheetId,title)" });
  const existing = meta.data.sheets.find((s) => s.properties.title === OUT_TAB);
  const reqs = [];
  if (existing) reqs.push({ deleteSheet: { sheetId: existing.properties.sheetId } });
  reqs.push({ addSheet: { properties: { title: OUT_TAB } } });
  const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } });
  const newSheetId = add.data.replies.find((r) => r.addSheet).addSheet.properties.sheetId;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${OUT_TAB}!A1`, valueInputOption: "USER_ENTERED",
    requestBody: { values: out.map((r) => r.map((c) => (c == null ? "" : c))) },
  });

  const fmt = [
    { repeatCell: { range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    { updateSheetProperties: { properties: { sheetId: newSheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 4 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } }, fields: "userEnteredFormat.numberFormat" } },
  ];
  for (const r of flagRows) {
    fmt.push({ repeatCell: { range: { sheetId: newSheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 7 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.98, green: 0.8, blue: 0.8 } } }, fields: "userEnteredFormat.backgroundColor" } });
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: fmt } });
  console.log(`\nWROTE ${out.length} rows to "${OUT_TAB}", highlighted ${flagRows.length} rows.`);
}
